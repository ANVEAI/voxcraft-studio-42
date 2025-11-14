import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50;
const BATCH_TIMEOUT_MS = 60000; // 60 seconds
const MAX_RETRIES = 2;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recordId } = await req.json();
    
    console.log(`🤖 Async AI Processing - Record ID: ${recordId}`);
    
    if (!recordId) {
      throw new Error('Record ID is required');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get raw data from database with batch tracking
    const { data: record, error: fetchError } = await supabase
      .from('scraped_websites')
      .select('raw_pages, url, user_id, processing_status, current_batch, total_batches, structured_data, batch_errors')
      .eq('id', recordId)
      .single();

    if (fetchError || !record) {
      throw new Error(`Failed to fetch record: ${fetchError?.message || 'Record not found'}`);
    }

    if (!record.raw_pages) {
      throw new Error('No raw pages data found for processing');
    }

    // Return immediately with 202 Accepted
    const response = new Response(JSON.stringify({
      success: true,
      message: 'AI processing started in background',
      recordId: recordId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 202
    });

    // Use waitUntil to continue processing in background
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil((async () => {
      try {
        console.log(`📋 Processing ${record.raw_pages.length} pages for ${record.url}`);

        // Get Lovable API key
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) {
          throw new Error('LOVABLE_API_KEY not configured');
        }

        // Filter valid pages
        const validPages = record.raw_pages.filter((p: any) => 
          p && p.markdown && p.markdown.trim().length > 0
        );
        console.log(`📋 Filtered ${validPages.length} valid pages from ${record.raw_pages.length} total`);

        // Pre-structure pages
        const preStructuredPages = validPages.map((page: any) => ({
          url: page.url || page.metadata?.sourceURL || '',
          title: page.metadata?.title || page.metadata?.ogTitle || '',
          description: page.metadata?.description || page.metadata?.ogDescription || '',
          content: page.markdown?.substring(0, 3000) || '',
          keywords: []
        }));
        console.log(`📋 Pre-structured ${preStructuredPages.length} pages from scraped URLs`);

        // Initialize batch processing on first run
        if (record.current_batch === 0) {
          const batches = splitIntoBatches(preStructuredPages, BATCH_SIZE);
          const totalBatches = batches.length;

          console.log(`🔄 Initializing BATCH processing: ${totalBatches} batches of ${BATCH_SIZE} pages`);

          await supabase
            .from('scraped_websites')
            .update({
              current_batch: 1,
              total_batches: totalBatches,
              processing_status: 'processing',
              structured_data: { pages: [], site_info: {}, navigation: {} },
              last_checked_at: new Date().toISOString()
            })
            .eq('id', recordId);

          // Fetch updated record
          const { data: updatedRecord } = await supabase
            .from('scraped_websites')
            .select('current_batch, total_batches, structured_data, batch_errors')
            .eq('id', recordId)
            .single();

          if (updatedRecord) {
            record.current_batch = updatedRecord.current_batch;
            record.total_batches = updatedRecord.total_batches;
            record.structured_data = updatedRecord.structured_data;
            record.batch_errors = updatedRecord.batch_errors;
          }
        }

        // Process current batch
        const batches = splitIntoBatches(preStructuredPages, BATCH_SIZE);
        const currentBatchIndex = record.current_batch - 1;
        const currentBatch = batches[currentBatchIndex];

        if (!currentBatch || currentBatch.length === 0) {
          throw new Error(`No batch found for index ${currentBatchIndex}`);
        }

        console.log(`📦 Processing batch ${record.current_batch}/${record.total_batches} (${currentBatch.length} pages)...`);

        // Send progress notification
        await notifyProgress(supabase, record.user_id, recordId, record.current_batch, record.total_batches);

        // Process batch with retry logic
        let batchResult = null;
        let retries = 0;
        let lastError = null;

        while (retries <= MAX_RETRIES && !batchResult) {
          try {
            batchResult = await processBatchWithAI(
              currentBatch,
              record.url,
              LOVABLE_API_KEY,
              record.current_batch,
              record.total_batches
            );
            console.log(`✅ Batch ${record.current_batch}/${record.total_batches} complete: ${batchResult.pages.length} pages enhanced`);
          } catch (error) {
            lastError = error;
            retries++;
            console.error(`❌ Batch ${record.current_batch} failed (attempt ${retries}/${MAX_RETRIES + 1}):`, error);
            
            if (retries <= MAX_RETRIES) {
              console.log(`🔄 Retrying batch ${record.current_batch}...`);
              await new Promise(resolve => setTimeout(resolve, 2000 * retries)); // Exponential backoff
            }
          }
        }

        // If all retries failed, use fallback data
        if (!batchResult) {
          console.error(`❌ Batch ${record.current_batch} failed after ${MAX_RETRIES + 1} attempts, using fallback`);
          batchResult = {
            pages: currentBatch.map((p: any) => ({
              ...p,
              keywords: [],
              fallback: true
            }))
          };

          // Log error
          const errors = Array.isArray(record.batch_errors) ? record.batch_errors : [];
          errors.push({
            batch: record.current_batch,
            error: lastError instanceof Error ? lastError.message : 'Unknown error',
            timestamp: new Date().toISOString()
          });

          await supabase
            .from('scraped_websites')
            .update({ batch_errors: errors })
            .eq('id', recordId);
        }

        // Append batch results to structured_data
        const existingPages = record.structured_data?.pages || [];
        const updatedPages = [...existingPages, ...batchResult.pages];

        // Check if this is the last batch
        const isLastBatch = record.current_batch >= record.total_batches;

        if (isLastBatch) {
          // Final processing: merge all batches
          console.log(`🎯 Final batch complete. Merging ${updatedPages.length} total pages...`);

          const finalData = {
            site_info: {
              url: record.url,
              title: updatedPages[0]?.title || '',
              description: updatedPages[0]?.description || '',
              total_pages: updatedPages.length
            },
            navigation: buildNavigationStructure(updatedPages),
            pages: updatedPages
          };

          const txtContent = generateKnowledgeBaseTXT(finalData);
          const encoder = new TextEncoder();
          const txtBytes = encoder.encode(txtContent);
          const sizeKB = Math.round(txtBytes.length / 1024);

          // Save final results
          await supabase
            .from('scraped_websites')
            .update({
              processing_status: 'completed',
              structured_data: finalData,
              knowledge_base_content: txtContent,
              pages_scraped: finalData.pages.length,
              total_size_kb: sizeKB,
              processed_at: new Date().toISOString(),
              last_checked_at: new Date().toISOString()
            })
            .eq('id', recordId);

          console.log(`✅ All batches complete! Processed ${finalData.pages.length} pages (${sizeKB}KB)`);

          // Notify completion
          await notifyUser(supabase, record.user_id, recordId, 'completed', {
            pagesProcessed: finalData.pages.length,
            sizeKB
          });

        } else {
          // Not the last batch - save progress and trigger next batch
          await supabase
            .from('scraped_websites')
            .update({
              current_batch: record.current_batch + 1,
              structured_data: { ...record.structured_data, pages: updatedPages },
              last_checked_at: new Date().toISOString()
            })
            .eq('id', recordId);

          console.log(`⏭️ Batch ${record.current_batch} saved. Triggering next batch...`);

          // Trigger next batch processing
          await supabase.functions.invoke('process-knowledge-base-async', {
            body: { recordId }
          });
        }

      } catch (error) {
        console.error('❌ AI processing failed:', error);
        
        await supabase
          .from('scraped_websites')
          .update({
            processing_status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            last_checked_at: new Date().toISOString()
          })
          .eq('id', recordId);

        await notifyUser(supabase, record.user_id, recordId, 'failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    })());

    return response;

  } catch (error) {
    console.error('❌ Request handling error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});

// Helper: Split pages into batches
function splitIntoBatches(pages: any[], batchSize: number): any[][] {
  const batches: any[][] = [];
  for (let i = 0; i < pages.length; i += batchSize) {
    batches.push(pages.slice(i, i + batchSize));
  }
  return batches;
}

// Helper: Process a single batch with timeout
async function processBatchWithAI(
  batch: any[],
  websiteUrl: string,
  apiKey: string,
  batchNum: number,
  totalBatches: number
): Promise<any> {
  const timeout = (ms: number) => new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Batch ${batchNum} timeout after ${ms}ms`)), ms)
  );

  const systemPrompt = `You are a website content analyzer. Enhance the provided pages with relevant keywords and maintain their structure.

Return ONLY valid JSON in this exact format:
{
  "pages": [
    {
      "url": "page url",
      "title": "page title",
      "description": "brief description",
      "content": "page content (max 3000 chars)",
      "keywords": ["keyword1", "keyword2"]
    }
  ]
}`;

  const userPrompt = `Analyze these ${batch.length} pages from ${websiteUrl} (batch ${batchNum}/${totalBatches}).
For each page, add 3-5 relevant keywords based on the content.

Pages:
${JSON.stringify(batch, null, 2)}`;

  try {
    const aiResponse = await Promise.race([
      fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 16000,
        }),
      }),
      timeout(BATCH_TIMEOUT_MS)
    ]);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`AI API error (${aiResponse.status}): ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const result = JSON.parse(jsonMatch[0]);

    if (!result.pages || !Array.isArray(result.pages)) {
      throw new Error('Invalid response structure');
    }

    return result;

  } catch (error) {
    console.error(`❌ Batch ${batchNum} processing error:`, error);
    throw error;
  }
}

// Helper: Build navigation structure from pages
function buildNavigationStructure(pages: any[]): any {
  const nav: any = {};
  
  pages.forEach(page => {
    try {
      const url = new URL(page.url);
      const pathParts = url.pathname.split('/').filter(p => p);
      
      let current = nav;
      pathParts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = index === pathParts.length - 1 ? page.url : {};
        }
        if (typeof current[part] === 'object') {
          current = current[part];
        }
      });
    } catch (e) {
      // Skip invalid URLs
    }
  });
  
  return nav;
}

// Helper: Generate knowledge base text file
function generateKnowledgeBaseTXT(data: any): string {
  let txt = '';
  
  // Site Info
  txt += '='.repeat(80) + '\n';
  txt += 'WEBSITE KNOWLEDGE BASE\n';
  txt += '='.repeat(80) + '\n\n';
  txt += `Website: ${data.site_info?.url || 'Unknown'}\n`;
  txt += `Title: ${data.site_info?.title || 'Unknown'}\n`;
  txt += `Description: ${data.site_info?.description || 'No description'}\n`;
  txt += `Total Pages: ${data.pages?.length || 0}\n`;
  txt += `Generated: ${new Date().toISOString()}\n\n`;
  
  // Navigation
  txt += '-'.repeat(80) + '\n';
  txt += 'SITE NAVIGATION STRUCTURE\n';
  txt += '-'.repeat(80) + '\n';
  txt += JSON.stringify(data.navigation || {}, null, 2) + '\n\n';
  
  // Page Index
  txt += '-'.repeat(80) + '\n';
  txt += 'PAGE INDEX\n';
  txt += '-'.repeat(80) + '\n';
  (data.pages || []).forEach((page: any, index: number) => {
    txt += `${index + 1}. ${page.title || 'Untitled'}\n`;
    txt += `   URL: ${page.url}\n`;
    txt += `   Keywords: ${(page.keywords || []).join(', ')}\n\n`;
  });
  
  // Full Page Content
  txt += '='.repeat(80) + '\n';
  txt += 'FULL PAGE CONTENT\n';
  txt += '='.repeat(80) + '\n\n';
  
  (data.pages || []).forEach((page: any, index: number) => {
    txt += `\n${'#'.repeat(80)}\n`;
    txt += `PAGE ${index + 1}: ${page.title || 'Untitled'}\n`;
    txt += `${'#'.repeat(80)}\n\n`;
    txt += `URL: ${page.url}\n`;
    txt += `Description: ${page.description || 'No description'}\n`;
    txt += `Keywords: ${(page.keywords || []).join(', ')}\n\n`;
    txt += '-'.repeat(80) + '\n';
    txt += 'CONTENT:\n';
    txt += '-'.repeat(80) + '\n';
    txt += page.content || 'No content available';
    txt += '\n\n';
  });
  
  return txt;
}

// Helper: Send progress notification
async function notifyProgress(
  supabase: any,
  userId: string,
  recordId: string,
  currentBatch: number,
  totalBatches: number
) {
  const progress = Math.round((currentBatch / totalBatches) * 100);
  
  try {
    await supabase
      .channel('processing_updates')
      .send({
        type: 'broadcast',
        event: 'processing_progress',
        payload: {
          userId,
          recordId,
          status: 'processing',
          currentBatch,
          totalBatches,
          progress,
          message: `Processing batch ${currentBatch}/${totalBatches} (${progress}%)`
        }
      });
  } catch (error) {
    console.error('Failed to send progress notification:', error);
  }
}

// Helper: Send completion/failure notification
async function notifyUser(
  supabase: any,
  userId: string,
  recordId: string,
  status: string,
  data?: any
) {
  try {
    await supabase
      .channel('processing_updates')
      .send({
        type: 'broadcast',
        event: 'processing_complete',
        payload: {
          userId,
          recordId,
          status,
          ...data
        }
      });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}
