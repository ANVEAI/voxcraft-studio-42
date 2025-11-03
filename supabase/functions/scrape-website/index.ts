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
    if (!requestBody) {
      throw new Error('Request body is required');
    }
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

    // Enhanced crawl configuration for deep comprehensive site coverage
    const crawlConfig = {
      url: url,
      limit: 200,                    // Fits within 300 credit budget
      maxDepth: 7,                   // Optimal depth for nested pages
      maxDiscoveryDepth: 10,         // Explicit discovery depth to find all nested pages
      allowBackwardLinks: false,     // Disabled to prioritize depth-first crawling
      allowExternalLinks: false,     // Stay within the same domain
      crawlEntireDomain: false,      // Stay focused on the given URL pattern
      ignoreSitemap: false,          // Use sitemap for additional page discovery
      delay: 100,                    // 100ms delay - optimal balance of speed and rate limiting
      timeout: 15000,                // 15s timeout per page to prevent hanging
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: false,      // Capture all navigation elements
        waitFor: 3000                // 3s wait time - sufficient for most JS rendering
      }
    };

    console.log(`📊 Deep crawl configuration:`, {
      limit: crawlConfig.limit,
      maxDepth: crawlConfig.maxDepth,
      maxDiscoveryDepth: crawlConfig.maxDiscoveryDepth,
      allowBackwardLinks: crawlConfig.allowBackwardLinks,
      delay: crawlConfig.delay,
      timeout: crawlConfig.timeout,
      waitFor: crawlConfig.scrapeOptions.waitFor,
      strategy: 'depth-first-optimized'
    });

    // Step 1: Initiate the crawl job (with retries for transient Firecrawl 5xx)
    const fetchWithRetries = async (input: string, init: RequestInit, retries = 4, baseDelayMs = 1000): Promise<Response> => {
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

          // For 5xx and 429, retry with backoff. For others, break early
          if ((resp.status >= 500 && resp.status < 600) || resp.status === 429) {
            const errorText = await resp.text().catch(() => '');
            console.warn(`⚠️ Firecrawl transient error (status ${resp.status}) on attempt #${attempt + 1}:`, errorText);
            lastError = new Error(`Firecrawl error: ${resp.status} - ${errorText}`);
          } else {
            const errorText = await resp.text().catch(() => '');
            throw new Error(`Firecrawl non-retriable error: ${resp.status} - ${errorText}`);
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

    const crawlResponse = await fetchWithRetries('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(crawlConfig),
    });

    const crawlData = await crawlResponse.json();
    console.log('📋 Crawl job initiated:', crawlData);

    if (!crawlData.id) {
      throw new Error('No job ID returned from Firecrawl');
    }

    const jobId = crawlData.id;
    console.log(`✅ Crawl job initiated: ${jobId}`);

    // Save initial scraping record to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: dbRecord, error: dbError } = await supabase.from('scraped_websites').insert({
      user_id: userId,
      url: url,
      status: 'scraping',
      firecrawl_job_id: jobId,
      pages_scraped: 0,
      total_size_kb: 0,
      last_checked_at: new Date().toISOString()
    }).select().single();

    if (dbError) {
      console.error('⚠️ Failed to save scraping record:', dbError);
    }

    // Return job ID and status immediately (no waiting!)
    return new Response(JSON.stringify({
      success: true,
      jobId: jobId,
      recordId: dbRecord?.id,
      status: 'scraping',
      websiteUrl: url,
      message: 'Scraping started successfully. Use check-scrape-status to poll for results.'
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
