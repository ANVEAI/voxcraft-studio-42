import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 25;
const BATCH_TIMEOUT_MS = 60000; // 60 seconds
const MAX_RETRIES = 2;
const MAX_CONTENT_LENGTH = 1500;

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

        // Pre-structure pages with reduced content and navigation metadata
        const preStructuredPages = validPages.map((page: any, index: number) => {
          const url = page.url || page.metadata?.sourceURL || '';

          // Derive a human-friendly page name
          let pageName: string;
          try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter((p) => p);
            const lastPart = pathParts[pathParts.length - 1] || 'home';
            pageName =
              page.metadata?.title ||
              lastPart
                .replace(/[-_]/g, ' ')
                .split(' ')
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
          } catch {
            pageName = page.metadata?.title || 'Unknown Page';
          }

          // Derive a simple parent name from URL path (for navigation)
          let parent: string | null = null;
          try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter((p) => p);
            if (pathParts.length > 1) {
              const parentPart = pathParts[pathParts.length - 2];
              parent = parentPart
                .replace(/[-_]/g, ' ')
                .split(' ')
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            }
          } catch {
            parent = null;
          }

          // Simple importance heuristic: homepage / top-level paths are high importance
          let importance: 'high' | 'medium' | 'low' = 'medium';
          try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter((p) => p);
            if (url === record.url || pathParts.length <= 1) {
              importance = 'high';
            }
          } catch {
            // leave as medium
          }

          return {
            id: `page_${index}`,
            url,
            page_name: pageName,
            title: page.metadata?.title || page.metadata?.ogTitle || '',
            description: page.metadata?.description || page.metadata?.ogDescription || '',
            content: page.markdown?.substring(0, MAX_CONTENT_LENGTH) || '',
            keywords: [],
            category: 'Information',
            importance,
            parent
          };
        });
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

          const siteInfo = {
            name: (() => {
              try {
                return new URL(record.url).hostname;
              } catch {
                return record.url;
              }
            })(),
            base_url: record.url,
            description: updatedPages[0]?.description || '',
            total_pages: updatedPages.length
          };

          const finalData = {
            site_info: siteInfo,
            navigation_structure: buildNavigationStructure(updatedPages),
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

  const systemPrompt = `You are a website content analyzer. Add 3-5 relevant keywords for each page based on its content.`;

  // Create minimal summaries for the prompt (don't send full content back)
  const pageSummaries = batch.map((page, idx) => ({
    index: idx,
    url: page.url,
    title: page.title,
    description: page.description,
    contentPreview: page.content?.substring(0, 500) || ''
  }));

  const userPrompt = `Analyze these ${batch.length} pages from ${websiteUrl} (batch ${batchNum}/${totalBatches}).
For each page, provide 3-5 relevant keywords.

Pages:
${JSON.stringify(pageSummaries, null, 2)}`;

  console.log(`📦 Batch ${batchNum} payload: ${batch.length} pages, avg content: ${Math.round(batch.reduce((sum, p) => sum + (p.content?.length || 0), 0) / batch.length)} chars`);

  try {
    const aiResponse: Response = await Promise.race([
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
          tools: [
            {
              type: "function",
              function: {
                name: "enhance_pages",
                description: "Add 3-5 relevant keywords for each page in the batch",
                parameters: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: { type: "integer", description: "Page index in the batch" },
                          keywords: {
                            type: "array",
                            items: { type: "string" },
                            description: "3-5 relevant keywords"
                          }
                        },
                        required: ["index", "keywords"],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ["items"],
                  additionalProperties: false
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "enhance_pages" } }
        }),
      }),
      timeout(BATCH_TIMEOUT_MS)
    ]);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      if (aiResponse.status === 429) {
        throw new Error(`Rate limit exceeded`);
      }
      if (aiResponse.status === 402) {
        throw new Error(`Payment required - out of credits`);
      }
      throw new Error(`AI API error (${aiResponse.status}): ${errorText}`);
    }

    const aiData = await aiResponse.json();
    
    // Try tool calling first (preferred)
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.name === "enhance_pages") {
      try {
        const toolResult = JSON.parse(toolCall.function.arguments);
        
        // Merge keywords back into batch pages
        const enhancedPages = batch.map((page, idx) => {
          const enhancement = toolResult.items?.find((item: any) => item.index === idx);
          return {
            ...page,
            keywords: Array.isArray(enhancement?.keywords) ? enhancement.keywords : []
          };
        });

        console.log(`✅ Batch ${batchNum} processed via tool calling: ${enhancedPages.length} pages`);
        return { pages: enhancedPages };
      } catch (parseError) {
        const error = parseError as Error;
        console.error(`⚠️ Tool call parse error for batch ${batchNum}:`, error);
        throw new Error(`Failed to parse tool call response: ${error.message}`);
      }
    }

    // Fallback: try content-based parsing (with hardened extraction)
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content or tool_calls in AI response');
    }

    console.log(`⚠️ Batch ${batchNum} falling back to content parsing (tool call not used)`);

    // Sanitize content
    let sanitized = content
      .replace(/```[\s\S]*?```/g, '') // Remove code fences
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ') // Remove control chars
      .replace(/\\(?!["\\/bfnrtu])/g, '\\\\'); // Escape invalid backslashes

    // Non-greedy JSON extraction
    const jsonMatch = sanitized.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      const snippet = sanitized.substring(0, 300);
      throw new Error(`No JSON found in response. Snippet: ${snippet}...`);
    }

    try {
      const result = JSON.parse(jsonMatch[0]);
      
      if (!result.items || !Array.isArray(result.items)) {
        throw new Error('Invalid fallback response structure (expected items array)');
      }

      // Merge keywords back into batch pages
      const enhancedPages = batch.map((page, idx) => {
        const enhancement = result.items?.find((item: any) => item.index === idx);
        return {
          ...page,
          keywords: Array.isArray(enhancement?.keywords) ? enhancement.keywords : []
        };
      });

      console.log(`✅ Batch ${batchNum} processed via fallback: ${enhancedPages.length} pages`);
      return { pages: enhancedPages };
      
    } catch (parseError) {
      const error = parseError as Error;
      // Log snippet around error for debugging
      const errorPos = error.message?.match(/position (\d+)/)?.[1];
      if (errorPos) {
        const pos = parseInt(errorPos);
        const snippet = jsonMatch[0].substring(Math.max(0, pos - 150), Math.min(jsonMatch[0].length, pos + 150));
        console.error(`❌ JSON parse error at position ${errorPos}. Snippet: ...${snippet}...`);
      }
      throw new Error(`JSON parse failed: ${error.message}`);
    }

  } catch (error) {
    console.error(`❌ Batch ${batchNum} processing error:`, error);
    throw error;
  }
}

// Helper: Build navigation structure from pages
function buildNavigationStructure(pages: any[]): any {
  const mainPages = new Set<string>();
  const subpages: { [key: string]: Set<string> } = {};

  for (const page of pages) {
    const pageName: string = page.page_name || page.title || page.url;

    // Identify main pages (high importance or no parent)
    if (page.importance === 'high' || !page.parent) {
      mainPages.add(pageName);
    }

    // Build parent-child relationships
    if (page.parent) {
      if (!subpages[page.parent]) {
        subpages[page.parent] = new Set<string>();
      }
      subpages[page.parent].add(pageName);
    }
  }

  return {
    main_pages: Array.from(mainPages),
    subpages: Object.fromEntries(
      Object.entries(subpages).map(([parent, children]) => [parent, Array.from(children)])
    )
  };
}

// Helper: Generate knowledge base text file (compact, navigation-focused)
function generateKnowledgeBaseTXT(data: any): string {
  let txt = `# Knowledge Base: ${data.site_info.name}\n`;
  txt += `Generated: ${new Date().toISOString()}\n`;
  txt += `Base URL: ${data.site_info.base_url}\n`;
  txt += `Description: ${data.site_info.description}\n`;
  txt += `Total Pages: ${data.pages.length}\n\n`;
  txt += `---\n\n`;

  // Navigation Structure
  txt += `## Navigation Structure\n\n`;
  txt += `Main Pages: ${data.navigation_structure.main_pages.join(', ')}\n\n`;

  if (data.navigation_structure.subpages) {
    for (const [parent, children] of Object.entries(data.navigation_structure.subpages)) {
      txt += `${parent} → ${(children as string[]).join(', ')}\n`;
    }
  }
  txt += `\n---\n\n`;

  // Page Index
  txt += `## Page Index\n\n`;

  const sortedPages = [...data.pages].sort((a: any, b: any) => {
    const importanceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const aVal = importanceOrder[a.importance] ?? 1;
    const bVal = importanceOrder[b.importance] ?? 1;
    return aVal - bVal;
  });

  for (const page of sortedPages) {
    const pageName: string = page.page_name || page.title || page.url;
    const pageId = pageName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    txt += `### ${pageId}\n`;
    txt += `URL: ${page.url}\n`;
    txt += `Category: ${page.category || 'Information'}\n`;
    txt += `Description: ${page.description}\n`;
    txt += `Keywords: ${(page.keywords || []).join(', ')}\n`;
    txt += `Importance: ${page.importance || 'medium'}\n`;
    if (page.parent) {
      txt += `Parent: ${page.parent}\n`;
    }
    txt += `\n`;
  }

  txt += `---\n\n`;

  // Quick Reference
  txt += `## Quick Reference\n\n`;
  txt += `Most Important Pages:\n`;

  const highPriorityPages = data.pages.filter((p: any) => p.importance === 'high');
  highPriorityPages.forEach((page: any, idx: number) => {
    const pageName: string = page.page_name || page.title || page.url;
    txt += `${idx + 1}. ${pageName} → ${page.url}\n`;
  });

  txt += `\n## Voice Command Examples\n\n`;
  data.pages.slice(0, 5).forEach((page: any) => {
    const pageName: string = page.page_name || page.title || page.url;
    txt += `"Go to ${pageName.toLowerCase()}" → ${page.url}\n`;
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
