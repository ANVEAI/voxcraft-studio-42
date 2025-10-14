import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rawPages, websiteUrl } = await req.json();
    
    console.log(`🤖 AI Processing - Pages: ${rawPages?.length || 0}, URL: ${websiteUrl}`);
    
    if (!rawPages || rawPages.length === 0) {
      throw new Error('No pages data provided');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Prepare data for AI analysis (including ALL links found on each page)
    const pagesData = rawPages.map((page: any) => ({
      url: page.url,
      title: page.metadata?.title || 'Untitled',
      description: page.metadata?.description || '',
      keywords: page.metadata?.keywords || '',
      markdown: page.markdown ? page.markdown.substring(0, 2000) : '', // Increased to 2000 chars for better context
      links: page.links || [], // All links found on this page (dropdowns, navigation, footer)
      linksFound: page.links?.length || 0
    }));

    const totalLinksDiscovered = pagesData.reduce((sum: number, p: any) => sum + p.linksFound, 0);
    console.log(`🔗 Total links discovered across all pages: ${totalLinksDiscovered}`);

    const systemPrompt = `You are a knowledge base architect specializing in voice navigation systems.

Your task is to analyze scraped website data and create a structured knowledge base optimized for the Vapi navigate_to_page tool.

OUTPUT FORMAT (strict JSON):
{
  "site_info": {
    "name": "Website Name",
    "base_url": "https://example.com",
    "description": "Brief site description"
  },
  "pages": [
    {
      "page_name": "Clear, descriptive page name",
      "url": "https://example.com/full-path",
      "category": "Main/Product/Blog/About/etc",
      "description": "2-3 sentence description of page content and purpose",
      "keywords": ["relevant", "search", "terms"],
      "parent": "Parent page name (if subpage)",
      "importance": "high/medium/low"
    }
  ],
  "navigation_structure": {
    "main_pages": ["Home", "Products", "About"],
    "subpages": {
      "Products": ["Product A", "Product B"]
    }
  }
}

RULES:
1. Each page MUST have a clear, human-readable page_name
2. URLs must be fully qualified (include domain)
3. Descriptions should explain what users will find on the page
4. Identify page hierarchy (main pages vs subpages)
5. Mark importance based on content depth and relevance
6. Consolidate duplicate/similar pages
7. **CRITICAL**: Include ALL pages from the scraped data, especially subpages found in dropdown menus, navigation bars, and footer links
8. Look at the "links" array for each page to discover related subpages not in main navigation
9. Do NOT skip pages just because they seem similar - dropdown items are often important navigation targets
10. For navigation structure, identify dropdown/submenu relationships (e.g., "Products" dropdown contains "Product A", "Product B")
11. Keep descriptions concise but informative (2-3 sentences max)
12. Extract meaningful keywords for voice matching
13. Remove only truly utility pages (privacy, terms) unless explicitly important
14. Return ONLY valid JSON, no markdown formatting`;

    const userPrompt = `Analyze this scraped website data and create a structured knowledge base:

WEBSITE URL: ${websiteUrl}
TOTAL PAGES SCRAPED: ${pagesData.length}
TOTAL LINKS DISCOVERED: ${totalLinksDiscovered}

SCRAPED DATA (includes page content + all links found):
${JSON.stringify(pagesData, null, 2)}

IMPORTANT INSTRUCTIONS:
- Each page object includes a "links" array showing ALL URLs discovered on that page
- Navigation dropdowns, submenus, and footer links are included in these link arrays
- Create entries for ALL unique pages found, not just main navigation items
- Map dropdown relationships using the "parent" field (e.g., if "Products" page links to "Product A", set parent: "Products")

Focus on:
- Including ALL pages from the data, especially dropdown/submenu items
- Clear page names for voice commands
- Accurate, full URLs for every page
- Logical hierarchy based on link relationships
- Keywords for fuzzy matching

Output valid JSON only.`;

    console.log('🧠 Calling Lovable AI for knowledge base structuring...');

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3, // Lower temperature for more structured output
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('❌ AI API error:', errorText);
      throw new Error(`AI processing failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0]?.message?.content;
    
    if (!aiContent) {
      throw new Error('No content from AI');
    }

    console.log('✅ AI response received, parsing JSON...');

    // Parse the JSON response (remove markdown code blocks if present)
    let structuredData;
    try {
      const cleanedContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      structuredData = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      console.log('Raw AI content:', aiContent);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Validate structure
    if (!structuredData.site_info || !structuredData.pages || !Array.isArray(structuredData.pages)) {
      throw new Error('Invalid structured data format from AI');
    }

    console.log(`✅ Structured ${structuredData.pages.length} pages into knowledge base`);

    // Generate formatted TXT knowledge base
    const txtContent = generateKnowledgeBaseTXT(structuredData);

    // Convert to base64
    const encoder = new TextEncoder();
    const txtBytes = encoder.encode(txtContent);
    const base64Content = btoa(String.fromCharCode(...txtBytes));
    
    const sizeKB = Math.round(txtBytes.length / 1024);
    const fileName = `${websiteUrl.replace(/https?:\/\//, '').replace(/\//g, '_')}_structured_kb.txt`;

    console.log(`📦 Generated structured knowledge base: ${fileName} (${sizeKB}KB)`);

    return new Response(JSON.stringify({
      success: true,
      structuredData,
      file: {
        name: fileName,
        data: `data:text/plain;base64,${base64Content}`,
        type: 'text/plain',
        size: txtBytes.length
      },
      pagesProcessed: structuredData.pages.length,
      sizeKB: sizeKB
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Processing error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

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

  // Sort by importance
  const sortedPages = [...data.pages].sort((a, b) => {
    const importanceOrder = { high: 0, medium: 1, low: 2 };
    return importanceOrder[a.importance as keyof typeof importanceOrder] - 
           importanceOrder[b.importance as keyof typeof importanceOrder];
  });

  for (const page of sortedPages) {
    const pageId = page.page_name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    txt += `### ${pageId}\n`;
    txt += `URL: ${page.url}\n`;
    txt += `Category: ${page.category}\n`;
    txt += `Description: ${page.description}\n`;
    txt += `Keywords: ${page.keywords.join(', ')}\n`;
    txt += `Importance: ${page.importance}\n`;
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
    txt += `${idx + 1}. ${page.page_name} → ${page.url}\n`;
  });

  txt += `\n## Voice Command Examples\n\n`;
  data.pages.slice(0, 5).forEach((page: any) => {
    txt += `"Go to ${page.page_name.toLowerCase()}" → ${page.url}\n`;
  });

  return txt;
}
