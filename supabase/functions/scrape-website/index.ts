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

    // Call Firecrawl API to crawl website
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        limit: 50, // Max 50 pages
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 3000 // Wait 3 seconds for JS to load
        }
      }),
    });

    if (!scrapeResponse.ok) {
      const errorText = await scrapeResponse.text();
      console.error('❌ Firecrawl API error:', errorText);
      throw new Error(`Firecrawl error: ${scrapeResponse.status} - ${errorText}`);
    }

    const scrapeData = await scrapeResponse.json();
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
