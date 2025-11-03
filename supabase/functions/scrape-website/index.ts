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

  let requestBody: { url: string; userId: string } | null = null;

  try {
    requestBody = await req.json();
    if (!requestBody) {
      throw new Error('Request body is required');
    }
    const { url, userId } = requestBody;
    
    console.log(`🕷️ Scrape request - URL: ${url}, User: ${userId}`);
    
    // Validate URL
    try {
      const parsedUrl = new URL(url);
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

    // Retry helper for transient Firecrawl errors
    const fetchWithRetries = async (input: string, init: RequestInit, retries = 4, baseDelayMs = 1000): Promise<Response> => {
      let attempt = 0;
      let lastError: any = null;
      while (attempt <= retries) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);
          const resp = await fetch(input, { ...init, signal: controller.signal });
          clearTimeout(timeout);

          if (resp.ok) return resp;

          if ((resp.status >= 500 && resp.status < 600) || resp.status === 429) {
            const errorText = await resp.text().catch(() => '');
            console.warn(`⚠️ Firecrawl transient error (status ${resp.status}) on attempt #${attempt + 1}:`, errorText);
            lastError = new Error(`Firecrawl error: ${resp.status} - ${errorText}`);
          } else {
            const errorText = await resp.text().catch(() => '');
            throw new Error(`Firecrawl non-retriable error: ${resp.status} - ${errorText}`);
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

    console.log(`🗺️ Step 1: Discovering URLs via Firecrawl v2 Map`);

    // Step 1: Map the website to discover all URLs
    const mapResponse = await fetchWithRetries('https://api.firecrawl.dev/v2/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        sitemap: 'include',
        includeSubdomains: false,
        ignoreQueryParameters: true,
        limit: 200,
        timeout: 10000,
        location: { country: 'US', languages: ['en-US'] }
      }),
    });

    const mapData = await mapResponse.json();
    console.log('🗺️ Map response:', mapData);

    if (!mapData.success || !mapData.links || mapData.links.length === 0) {
      throw new Error('No URLs discovered during mapping. Site may be unreachable or empty.');
    }

    const discoveredUrls = mapData.links.map((link: any) => link.url).slice(0, 200);
    console.log(`✅ Discovered ${discoveredUrls.length} URLs (sitemap included, query params ignored)`);

    console.log(`🚀 Step 2: Starting high-speed batch scrape with v2`);

    // Step 2: Batch scrape all discovered URLs
    const scrapeConfig = {
      urls: discoveredUrls,
      maxConcurrency: 10,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 800,
        timeout: 8000,
        blockAds: true,
        removeBase64Images: true,
        parsePDF: false,
        storeInCache: true,
        proxy: 'auto',
        location: { country: 'US', languages: ['en-US'] }
      }
    };

    console.log(`🚀 Batch scrape config:`, {
      urlCount: discoveredUrls.length,
      maxConcurrency: scrapeConfig.maxConcurrency,
      waitFor: scrapeConfig.scrapeOptions.waitFor,
      timeout: scrapeConfig.scrapeOptions.timeout,
      onlyMainContent: scrapeConfig.scrapeOptions.onlyMainContent,
      proxy: scrapeConfig.scrapeOptions.proxy,
      strategy: 'v2-map-batch-ultra-fast'
    });

    const batchResponse = await fetchWithRetries('https://api.firecrawl.dev/v2/batch/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scrapeConfig),
    });

    const batchData = await batchResponse.json();
    console.log('📋 Batch scrape job initiated:', batchData);

    if (!batchData.success || !batchData.id) {
      throw new Error('Failed to initiate batch scrape: ' + (batchData.error || 'No job ID returned'));
    }

    const batchId = batchData.id;
    console.log(`✅ Batch scrape job initiated: ${batchId}`);

    // Save initial scraping record to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: dbRecord, error: dbError } = await supabase.from('scraped_websites').insert({
      user_id: userId,
      url: url,
      status: 'scraping',
      firecrawl_job_id: batchId,
      pages_scraped: 0,
      total_size_kb: 0,
      last_checked_at: new Date().toISOString()
    }).select().single();

    if (dbError) {
      console.error('⚠️ Failed to save scraping record:', dbError);
    }

    // Return job ID and status immediately
    return new Response(JSON.stringify({
      success: true,
      jobId: batchId,
      recordId: dbRecord?.id,
      status: 'scraping',
      websiteUrl: url,
      totalUrls: discoveredUrls.length,
      message: 'High-speed v2 batch scraping started. Use check-scrape-status to poll for results.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Scraping error:', error);
    
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
          completed_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString()
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
