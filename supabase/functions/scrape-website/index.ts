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

    console.log(`🕷️ Starting comprehensive crawl with Firecrawl v2 Crawl endpoint`);

    // Use /crawl endpoint for comprehensive website scraping with depth control
    const crawlConfig = {
      url: url,
      maxDiscoveryDepth: 4,           // Crawl up to 4 levels deep
      sitemap: 'include',             // Use sitemap + discover more links
      crawlEntireDomain: true,        // Crawl siblings/parents, not just children
      ignoreQueryParameters: true,    // Ignore query params for cleaner URLs
      limit: 500,                     // Max pages to crawl
      allowExternalLinks: false,      // Stay within the domain
      allowSubdomains: false,         // Don't crawl subdomains
      maxConcurrency: 10,             // Parallel scraping
      scrapeOptions: {
        formats: ['markdown'],        // Get markdown content
        onlyMainContent: true,        // Extract main content only
        waitFor: 1000,                // Wait 1s for JavaScript
        timeout: 20000,               // 20s timeout per page
        blockAds: true,               // Block ads for cleaner content
        location: { 
          country: 'US', 
          languages: ['en-US'] 
        }
      }
    };

    console.log(`🕷️ Crawl configuration:`, {
      url: url,
      maxDiscoveryDepth: crawlConfig.maxDiscoveryDepth,
      crawlEntireDomain: crawlConfig.crawlEntireDomain,
      limit: crawlConfig.limit,
      strategy: 'v2-crawl-comprehensive'
    });

    const crawlResponse = await fetchWithRetries('https://api.firecrawl.dev/v2/crawl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(crawlConfig),
    });

    const crawlData = await crawlResponse.json();
    console.log('🕷️ Crawl job initiated:', crawlData);

    if (!crawlData.success || !crawlData.id) {
      throw new Error('Failed to initiate crawl: ' + (crawlData.error || 'No job ID returned'));
    }

    const crawlId = crawlData.id;
    console.log(`✅ Crawl job initiated: ${crawlId}`);

    // Save initial scraping record to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: dbRecord, error: dbError } = await supabase.from('scraped_websites').insert({
      user_id: userId,
      url: url,
      status: 'scraping',
      firecrawl_job_id: crawlId,
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
      jobId: crawlId,
      recordId: dbRecord?.id,
      status: 'scraping',
      websiteUrl: url,
      crawlDepth: crawlConfig.maxDiscoveryDepth,
      crawlLimit: crawlConfig.limit,
      message: 'Comprehensive v2 crawl started with depth control. Use check-scrape-status to poll for results.'
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
