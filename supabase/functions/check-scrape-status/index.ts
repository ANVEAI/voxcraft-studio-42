import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Check Firecrawl job status
    const statusResponse = await fetch(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      },
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error('❌ Firecrawl API error:', errorText);
      throw new Error(`Firecrawl error: ${statusResponse.status} - ${errorText}`);
    }

    const jobStatus = await statusResponse.json();
    console.log(`📊 Job status: ${jobStatus.status}, Completed: ${jobStatus.completed || 0}/${jobStatus.total || 0}`);

    // Update database record
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
