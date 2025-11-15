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
      const timeout = setTimeout(() => controller.abort(), 90000);
      const resp = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timeout);

      if (resp.ok) return resp;

      if ((resp.status >= 500 && resp.status < 600) || resp.status === 429) {
        const errorText = await resp.text().catch(() => '');
        console.warn(`⚠️ Firecrawl transient error (status ${resp.status}) on attempt #${attempt + 1}:`, errorText);
        lastError = new Error(`Firecrawl error: ${resp.status} - ${errorText}`);
      } else {
        return resp;
      }
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Firecrawl request failed on attempt #${attempt + 1}:`, err instanceof Error ? err.message : err);
    }

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let jobStatus: any = null;
    let degraded = false;
    let apiMode = 'unknown';

    // Try v2 batch scrape status first (priority)
    try {
      console.log('🔍 Trying v2 batch scrape status...');
      const statusResponse = await fetchWithRetries(`https://api.firecrawl.dev/v2/batch/scrape/${jobId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        },
      });

      if (statusResponse.ok) {
        jobStatus = await statusResponse.json();
        apiMode = 'v2-batch';
        console.log(`📊 v2 Batch status: ${jobStatus.status}, Completed: ${jobStatus.completed || 0}/${jobStatus.total || 0}`);
        
        // Handle pagination for completed jobs
        if (jobStatus.status === 'completed' && jobStatus.data) {
          let allData = [...jobStatus.data];
          let nextUrl = jobStatus.next;
          let pageCount = 1;
          const MAX_PAGES = 50; // Safety limit
          
          while (nextUrl && pageCount < MAX_PAGES) {
            console.log(`📄 Fetching page ${pageCount + 1} of results...`);
            const nextResponse = await fetchWithRetries(nextUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
              },
            });
            
            if (nextResponse.ok) {
              const nextData = await nextResponse.json();
              if (nextData.data && nextData.data.length > 0) {
                allData = [...allData, ...nextData.data];
              }
              nextUrl = nextData.next;
              pageCount++;
            } else {
              console.warn('⚠️ Failed to fetch next page, using partial data');
              break;
            }
          }
          
          jobStatus.data = allData;
          console.log(`✅ Retrieved ${allData.length} total results across ${pageCount} page(s)`);
        }
      } else if (statusResponse.status === 404 || statusResponse.status === 400) {
        // Not a batch job, try v2 crawl
        console.log('🔍 Not a batch job, trying v2 crawl status...');
        const v2CrawlResponse = await fetchWithRetries(`https://api.firecrawl.dev/v2/crawl/${jobId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          },
        });

        if (v2CrawlResponse.ok) {
          jobStatus = await v2CrawlResponse.json();
          apiMode = 'v2-crawl';
          console.log(`📊 v2 Crawl status: ${jobStatus.status}, Completed: ${jobStatus.completed || 0}/${jobStatus.total || 0}`);
        } else {
          // Fall back to v1
          console.log('🔍 Trying v1 crawl status...');
          const v1Response = await fetchWithRetries(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
            },
          });

          if (!v1Response.ok) {
            const errorText = await v1Response.text();
            throw new Error(`All API versions failed: ${errorText}`);
          }

          jobStatus = await v1Response.json();
          apiMode = 'v1-crawl';
          console.log(`📊 v1 Crawl status: ${jobStatus.status}, Completed: ${jobStatus.completed || 0}/${jobStatus.total || 0}`);
        }
      } else {
        const errorText = await statusResponse.text();
        throw new Error(`v2 batch status failed: ${errorText}`);
      }
    } catch (error) {
      console.warn('⚠️ All Firecrawl status checks failed. Using degraded mode.');
      degraded = true;

      if (recordId) {
        const { data: dbRecord } = await supabase
          .from('scraped_websites')
          .select('pages_scraped, status')
          .eq('id', recordId)
          .eq('user_id', userId)
          .single();

        if (dbRecord) {
          return new Response(JSON.stringify({
            success: true,
            status: dbRecord.status || 'scraping',
            completed: dbRecord.pages_scraped || 0,
            total: 0,
            data: null,
            creditsUsed: 0,
            degraded: true,
            apiMode: 'degraded-db-fallback',
            note: 'Temporary Firecrawl status issue. Continue polling.'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        status: 'scraping',
        completed: 0,
        total: 0,
        data: null,
        creditsUsed: 0,
        degraded: true,
        apiMode: 'degraded-no-data',
        note: 'Temporary Firecrawl status issue. Continue polling.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle queued status gracefully
    if (jobStatus.status === 'queued') {
      console.log('⏳ Job is queued; Firecrawl will start shortly.');
      return new Response(JSON.stringify({
        success: true,
        status: 'queued',
        completed: jobStatus.completed || 0,
        total: jobStatus.total || 0,
        data: null,
        creditsUsed: 0,
        degraded: false,
        apiMode: apiMode,
        note: 'Job queued. Starting soon.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let dbStatus = 'scraping';
    let updateData: any = {
      last_checked_at: new Date().toISOString(),
      pages_scraped: jobStatus.completed || 0,
    };

    // Handle completed status
    if (jobStatus.status === 'completed') {
      dbStatus = 'scraped'; // Changed from 'completed' to 'scraped'
      updateData = {
        ...updateData,
        status: 'scraped',
        raw_pages: jobStatus.data || [], // Save raw pages for async processing
        processing_status: 'pending', // Set processing status to pending
        scraped_at: new Date().toISOString(),
      };
      console.log(`✅ Scrape completed: ${jobStatus.data?.length || 0} pages retrieved`);
      
      // Trigger async AI processing ONLY ONCE when transitioning to 'scraped'
      if (recordId && jobStatus.data && jobStatus.data.length > 0) {
        // Check if we should trigger async processing (only if status is 'pending')
        const { data: dbRecord } = await supabase
          .from('scraped_websites')
          .select('processing_status')
          .eq('id', recordId)
          .single();
        
        if (dbRecord?.processing_status === 'pending') {
          console.log('🚀 Triggering async AI processing (first time)...');
          try {
            // Trigger async processing (fire and forget)
            fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-knowledge-base-async`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ recordId })
            }).catch(error => {
              console.error('⚠️ Failed to trigger async processing:', error);
            });
            
            console.log('✅ Async processing triggered successfully');
          } catch (error) {
            console.error('⚠️ Error triggering async processing:', error);
          }
        } else {
          console.log(`⏭️ Skipping async trigger - processing_status is '${dbRecord?.processing_status}'`);
        }
      }
    } 
    // Handle failed status
    else if (jobStatus.status === 'failed') {
      dbStatus = 'failed';
      updateData = {
        ...updateData,
        status: 'failed',
        error_message: jobStatus.error || 'Firecrawl job failed',
        completed_at: new Date().toISOString(),
      };
      console.log('❌ Scrape failed:', jobStatus.error);
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

    // Get processing status for completed scrapes
    let processingStatus = 'pending';
    let knowledgeBaseReady = false;
    let structuredData = null;
    
    if (jobStatus.status === 'completed' && recordId) {
      // Get processing status from database
      const { data: dbRecord } = await supabase
        .from('scraped_websites')
        .select('processing_status, structured_data, knowledge_base_content')
        .eq('id', recordId)
        .single();
      
      if (dbRecord) {
        processingStatus = dbRecord.processing_status || 'pending';
        knowledgeBaseReady = processingStatus === 'completed';
        structuredData = dbRecord.structured_data;
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
      apiMode: apiMode,
      // New async processing fields
      processingStatus: processingStatus,
      knowledgeBaseReady: knowledgeBaseReady,
      structuredData: knowledgeBaseReady ? structuredData : null,
      message: jobStatus.status === 'completed' ? 
        (knowledgeBaseReady ? 'Knowledge base ready!' : 'Scraping complete! AI processing in background...') :
        undefined
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
