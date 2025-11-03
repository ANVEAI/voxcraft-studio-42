import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry helper for Firecrawl status checks with exponential backoff
const fetchWithRetries = async (input: string, init: RequestInit, retries = 3, baseDelayMs = 1000): Promise<Response> => {
  let attempt = 0;
  let lastError: any = null;
  
  while (attempt <= retries) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout per attempt
      const resp = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timeout);

      // If OK, return immediately
      if (resp.ok) return resp;

      // For 5xx and 429, retry with backoff
      if ((resp.status >= 500 && resp.status < 600) || resp.status === 429) {
        const errorText = await resp.text().catch(() => '');
        console.warn(`⚠️ Firecrawl transient error (status ${resp.status}) on attempt #${attempt + 1}:`, errorText);
        lastError = new Error(`Firecrawl error: ${resp.status} - ${errorText}`);
      } else {
        // Non-retriable error, return the response to handle elsewhere
        return resp;
      }
    } catch (err) {
      // Network/timeout/abort errors are retriable
      lastError = err;
      console.warn(`⚠️ Firecrawl request failed on attempt #${attempt + 1}:`, err instanceof Error ? err.message : err);
    }

    // Backoff with jitter before next attempt
    attempt++;
    if (attempt <= retries) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((res) => setTimeout(res, delay + jitter));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unknown Firecrawl error after retries');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId, userId, recordId } = await req.json();
    
    console.log(`🔍 Checking scrape status - Job: ${jobId}, User: ${userId}`);

    if (!jobId || !userId) {
      throw new Error('Missing required parameters: jobId and userId');
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    // Initialize Supabase client (for fallback queries if needed)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let jobStatus: any = null;
    let degraded = false;

    // Check Firecrawl job status with retries
    try {
      const statusResponse = await fetchWithRetries(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        },
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error('❌ Firecrawl API error after retries:', errorText);
        throw new Error(`Firecrawl error: ${statusResponse.status} - ${errorText}`);
      }

      jobStatus = await statusResponse.json();
    } catch (error) {
      // Firecrawl is temporarily unavailable - fall back to last-known DB state
      console.warn('⚠️ Firecrawl status fetch failed after retries. Using degraded mode with last-known DB state.');
      degraded = true;

      // Query last-known state from database
      if (recordId) {
        const { data: dbRecord } = await supabase
          .from('scraped_websites')
          .select('pages_scraped, status')
          .eq('id', recordId)
          .eq('user_id', userId)
          .single();

        if (dbRecord) {
          // Return degraded response with last-known state
          return new Response(JSON.stringify({
            success: true,
            status: dbRecord.status || 'scraping',
            completed: dbRecord.pages_scraped || 0,
            total: 0,
            data: null,
            creditsUsed: 0,
            degraded: true,
            note: 'Temporary Firecrawl status issue. Continue polling.'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // No DB record available - return minimal degraded response
      return new Response(JSON.stringify({
        success: true,
        status: 'scraping',
        completed: 0,
        total: 0,
        data: null,
        creditsUsed: 0,
        degraded: true,
        note: 'Temporary Firecrawl status issue. Continue polling.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`📊 Job status: ${jobStatus.status}, Completed: ${jobStatus.completed || 0}/${jobStatus.total || 0}, Credits: ${jobStatus.creditsUsed || 0}`);

    let dbStatus = 'scraping';
    let updateData: any = {
      last_checked_at: new Date().toISOString(),
      pages_scraped: jobStatus.completed || 0,
    };

    // Handle completed status
    if (jobStatus.status === 'completed') {
      dbStatus = 'completed';
      updateData = {
        ...updateData,
        status: 'completed',
        raw_data: jobStatus.data || [],
        completed_at: new Date().toISOString(),
      };
      console.log(`✅ Scrape completed: ${jobStatus.data?.length || 0} pages`);
    } 
    // Handle failed status
    else if (jobStatus.status === 'failed') {
      dbStatus = 'failed';
      updateData = {
        ...updateData,
        status: 'failed',
        error_message: 'Firecrawl job failed',
        completed_at: new Date().toISOString(),
      };
      console.log('❌ Scrape failed');
    }

    // Update the database record
    if (recordId) {
      const { error: dbError } = await supabase
        .from('scraped_websites')
        .update(updateData)
        .eq('id', recordId)
        .eq('user_id', userId);

      if (dbError) {
        console.error('⚠️ Failed to update scraping record:', dbError);
      }
    }

    // Return current status to frontend
    return new Response(JSON.stringify({
      success: true,
      status: jobStatus.status,
      completed: jobStatus.completed || 0,
      total: jobStatus.total || 0,
      data: jobStatus.status === 'completed' ? jobStatus.data : null,
      creditsUsed: jobStatus.creditsUsed || 0,
      expiresAt: jobStatus.expiresAt,
      degraded: degraded,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error checking scrape status:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
