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

  // Store request body to avoid "Body already consumed" error
  let requestBody: { url: string; userId: string } | null = null;

  try {
    requestBody = await req.json();
    const { url, userId } = requestBody;
    
    console.log(`🕷️ Scrape request - URL: ${url}, User: ${userId}`);
    
    // Validate URL
    try {
      const parsedUrl = new URL(url);
      // Prevent dangerous protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid URL protocol. Only HTTP and HTTPS are allowed.');
      }
    } catch (error) {
      throw new Error('Invalid URL format');
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    console.log(`🕷️ Starting crawl for: ${url}`);

    // Step 1: Initiate the crawl job
    const crawlResponse = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        limit: 30, // Reduced from 50 to prevent timeouts
        scrapeOptions: {
          formats: ['markdown', 'links'], // Include links to capture navigation/dropdown URLs
          onlyMainContent: true,
          includeTags: ['nav', 'header', 'meta'],
          waitFor: 3000
        }
      }),
    });

    if (!crawlResponse.ok) {
      const errorText = await crawlResponse.text();
      console.error('❌ Firecrawl API error:', errorText);
      throw new Error(`Firecrawl error: ${crawlResponse.status} - ${errorText}`);
    }

    const crawlData = await crawlResponse.json();
    console.log('📋 Crawl job initiated:', crawlData);

    if (!crawlData.id) {
      throw new Error('No job ID returned from Firecrawl');
    }

    const jobId = crawlData.id;
    console.log(`⏳ Polling job: ${jobId}`);

    // Step 2: Poll for job completion (with partial scrape support)
    const maxAttempts = 90; // 90 attempts * 2 seconds = 180 seconds max
    const pollInterval = 2000; // 2 seconds
    let attempts = 0;
    let jobStatus = null;

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`🔄 Poll attempt ${attempts}/${maxAttempts}`);

      const statusResponse = await fetch(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        },
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error('❌ Error checking job status:', errorText);
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }

      jobStatus = await statusResponse.json();
      console.log(`📊 Job status: ${jobStatus.status}, Completed: ${jobStatus.completed || 0}/${jobStatus.total || 0}`);

      if (jobStatus.status === 'completed') {
        console.log('✅ Crawl completed successfully');
        break;
      } else if (jobStatus.status === 'failed') {
        throw new Error('Crawl job failed');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Handle partial scrapes - if we have some data, use it even if not fully completed
    if (!jobStatus) {
      throw new Error('Failed to retrieve crawl status');
    }

    const hasPartialData = jobStatus.data && jobStatus.data.length > 0;
    
    if (jobStatus.status !== 'completed' && !hasPartialData) {
      throw new Error(`Crawl job timed out after 180 seconds with no data scraped`);
    }

    if (jobStatus.status !== 'completed' && hasPartialData) {
      console.log(`⚠️ Crawl incomplete but proceeding with ${jobStatus.completed}/${jobStatus.total} pages`);
    }

    // Step 3: Return raw scraped data for AI processing
    const scrapeData = jobStatus;
    console.log(`✅ Scraped ${scrapeData.data?.length || 0} pages`);

    // Return raw data without processing - frontend will handle AI processing
    const rawPages = scrapeData.data || [];

    // Save scraping record to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: dbError } = await supabase.from('scraped_websites').insert({
      user_id: userId,
      url: url,
      status: 'completed',
      pages_scraped: scrapeData.data?.length || 0,
      total_size_kb: 0, // Will be updated after AI processing
      completed_at: new Date().toISOString()
    });

    if (dbError) {
      console.error('⚠️ Failed to save scraping record:', dbError);
    }

    return new Response(JSON.stringify({
      success: true,
      rawPages: rawPages,
      pagesScraped: rawPages.length,
      websiteUrl: url
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Scraping error:', error);
    
    // Try to save error to database (using stored requestBody to avoid "Body already consumed" error)
    if (requestBody) {
      try {
        const { url, userId } = requestBody;
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        await supabase.from('scraped_websites').insert({
          user_id: userId,
          url: url,
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString()
        });
      } catch (dbError) {
        console.error('⚠️ Failed to save error record:', dbError);
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
