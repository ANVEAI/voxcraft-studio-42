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
    const { url, userId } = await req.json();
    
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
        limit: 50,
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true,
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

    // Step 2: Poll for job completion
    const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds max
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

    if (!jobStatus || jobStatus.status !== 'completed') {
      throw new Error('Crawl job timed out after 60 seconds');
    }

    // Step 3: Process the scraped data
    const scrapeData = jobStatus;
    console.log(`✅ Scraped ${scrapeData.data?.length || 0} pages`);

    // Convert scraped data to TXT format
    let txtContent = `# Knowledge Base for ${url}\n`;
    txtContent += `Scraped on: ${new Date().toISOString()}\n`;
    txtContent += `Total Pages: ${scrapeData.data?.length || 0}\n\n`;
    txtContent += `---\n\n`;

    if (scrapeData.data && scrapeData.data.length > 0) {
      scrapeData.data.forEach((page: any, index: number) => {
        txtContent += `## Page ${index + 1}: ${page.metadata?.title || page.url}\n`;
        txtContent += `URL: ${page.url}\n\n`;
        txtContent += page.markdown || page.content || '';
        txtContent += `\n\n---\n\n`;
      });
    }

    // Convert to base64
    const encoder = new TextEncoder();
    const txtBytes = encoder.encode(txtContent);
    const base64Content = btoa(String.fromCharCode(...txtBytes));
    
    const sizeKB = Math.round(txtBytes.length / 1024);
    const fileName = `${url.replace(/https?:\/\//, '').replace(/\//g, '_')}_knowledge.txt`;

    console.log(`📦 Generated knowledge base: ${fileName} (${sizeKB}KB)`);

    // Save scraping record to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: dbError } = await supabase.from('scraped_websites').insert({
      user_id: userId,
      url: url,
      status: 'completed',
      pages_scraped: scrapeData.data?.length || 0,
      total_size_kb: sizeKB,
      completed_at: new Date().toISOString()
    });

    if (dbError) {
      console.error('⚠️ Failed to save scraping record:', dbError);
    }

    return new Response(JSON.stringify({
      success: true,
      file: {
        name: fileName,
        data: `data:text/plain;base64,${base64Content}`,
        type: 'text/plain',
        size: txtBytes.length
      },
      pagesScraped: scrapeData.data?.length || 0,
      sizeKB: sizeKB
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Scraping error:', error);
    
    // Try to save error to database
    try {
      const { url, userId } = await req.json();
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

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
