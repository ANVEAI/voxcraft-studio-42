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

    // Filter out pages with invalid URLs first
    const validPagesInput = rawPages.filter((page: any, index: number) => {
      if (!page.url || page.url === 'undefined' || page.url === '') {
        console.warn(`⚠️ Skipping page ${index} with invalid URL:`, page.url);
        return false;
      }
      try {
        new URL(page.url); // Validate URL format
        return true;
      } catch (e) {
        console.warn(`⚠️ Skipping page ${index} with malformed URL:`, page.url);
        return false;
      }
    });
    
    console.log(`✅ Filtered ${rawPages.length} raw pages → ${validPagesInput.length} valid pages`);

    // Pre-create page structure from ALL valid scraped URLs (guarantees 100% coverage)
    const preStructuredPages = validPagesInput.map((page: any, index: number) => {
      const url = page.url;
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1] || 'home';
      
      // Generate a clean page name from URL
      const pageName = page.metadata?.title || 
                       lastPart.replace(/-/g, ' ').replace(/_/g, ' ')
                         .split(' ')
                         .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                         .join(' ') || 'Home';
      
      // Clean the links array - only include valid URLs
      const cleanLinks = (page.links || [])
        .filter((link: string) => link && link.startsWith('http'))
        .slice(0, 20);

      return {
        id: `page_${index}`,
        url: url,
        page_name: pageName,
        title: page.metadata?.title || '',
        description: page.metadata?.description || '',
        keywords: page.metadata?.keywords || '',
        markdown_preview: page.markdown ? page.markdown.substring(0, 2000) : '',
        links: cleanLinks,
        category: 'To be determined by AI',
        importance: 'medium',
        parent: null
      };
    });

    console.log(`📋 Pre-structured ${preStructuredPages.length} pages from scraped URLs`);

    const systemPrompt = `You are a knowledge base enhancer for voice navigation systems.

You will receive a PRE-STRUCTURED list of pages (with URLs already assigned). Your job is to ENHANCE each page entry, NOT create new ones.

For each page, improve:
1. **page_name**: Make it clear and voice-friendly (e.g., "Contact Us" not "contact-us-page-title")
2. **category**: Assign appropriate category (Main/Product/Service/Resource/About/etc)
3. **description**: Write 2-3 sentences explaining what's on this page
4. **keywords**: Extract 5-10 relevant keywords for voice matching (as array)
5. **parent**: If it's a subpage, identify the parent page name
6. **importance**: Assess as high/medium/low based on content

CRITICAL RULES:
- DO NOT add new pages
- DO NOT remove any pages
- DO NOT change URLs
- ONLY enhance the existing page entries
- Return ALL pages you received, just with better data

OUTPUT FORMAT (strict JSON):
{
  "site_info": {
    "name": "Website Name",
    "base_url": "https://example.com",
    "description": "Brief site description"
  },
  "pages": [ /* ALL pages with enhancements */ ],
  "navigation_structure": {
    "main_pages": ["Home", "Products"],
    "subpages": { "Products": ["Product A"] }
  }
}`;

    const userPrompt = `Enhance this pre-structured knowledge base with better descriptions, categories, and hierarchy.

WEBSITE: ${websiteUrl}
PAGES TO ENHANCE: ${preStructuredPages.length}

PRE-STRUCTURED PAGES (you must return ALL of these with enhancements):
${JSON.stringify(preStructuredPages, null, 2)}

INSTRUCTIONS:
- Return ALL ${preStructuredPages.length} pages
- Improve page names, descriptions, keywords (as arrays), categories
- Identify parent-child relationships from the links data
- Do NOT add or remove pages
- Do NOT change URLs

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
        ]
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

    console.log(`🤖 AI returned ${structuredData.pages?.length || 0} pages`);

    // Validate AI didn't drop any pages
    if (structuredData.pages.length !== preStructuredPages.length) {
      console.error(`⚠️ AI returned ${structuredData.pages.length} pages but expected ${preStructuredPages.length}`);
      
      // Find missing page IDs
      const returnedIds = new Set(structuredData.pages.map((p: any) => p.id || p.url));
      const missingPages = preStructuredPages.filter((p: any) => 
        !returnedIds.has(p.id) && !returnedIds.has(p.url)
      );
      
      // Re-add missing pages
      if (missingPages.length > 0) {
        structuredData.pages.push(...missingPages);
        console.log(`✅ Re-added ${missingPages.length} missing pages`);
      }
    }

    // Ensure no page has undefined URL
    const validPages = structuredData.pages.filter((p: any) => {
      if (!p.url || p.url === 'undefined') {
        console.warn(`⚠️ Removing invalid page: ${p.page_name} (no URL)`);
        return false;
      }
      return true;
    });

    structuredData.pages = validPages;

    // Final validation
    console.log(`✅ Final knowledge base contains ${structuredData.pages.length} pages`);
    console.log(`📊 Coverage: ${Math.round((structuredData.pages.length / rawPages.length) * 100)}% of scraped pages`);
    console.log(`🔗 Pages with parents: ${structuredData.pages.filter((p: any) => p.parent).length}`);

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
