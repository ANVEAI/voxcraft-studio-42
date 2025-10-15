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

    // Filter out pages with invalid URLs
    const validPages = rawPages.filter((page: any) => {
      return page.url && page.url !== 'undefined' && page.url.trim() !== '';
    });

    console.log(`📋 Filtered ${validPages.length} valid pages from ${rawPages.length} total`);

    // Pre-create structure from ALL scraped URLs to ensure 100% coverage
    const preStructuredPages = validPages.map((page: any, index: number) => {
      const url = page.url;
      let pageName: string;
      
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const lastPart = pathParts[pathParts.length - 1] || 'home';
        
        // Generate clean page name from URL or title
        pageName = page.metadata?.title || 
                   lastPart.replace(/-/g, ' ').replace(/_/g, ' ')
                     .split(' ')
                     .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                     .join(' ');
      } catch (e) {
        pageName = 'Unknown Page';
      }
      
      return {
        id: `page_${index}`,
        url: url,
        page_name: pageName,
        title: page.metadata?.title || '',
        description: page.metadata?.description || '',
        keywords: page.metadata?.keywords || '',
        markdown_preview: page.markdown ? page.markdown.substring(0, 2000) : '',
        category: 'To be determined',
        importance: 'medium',
        parent: null
      };
    });

    console.log(`📋 Pre-structured ${preStructuredPages.length} pages from scraped URLs`);

    const systemPrompt = `You are a knowledge base enhancer for voice navigation systems.

You will receive a PRE-STRUCTURED list of pages with URLs already assigned. Your job is to ENHANCE each page entry, NOT create or remove pages.

For each page, improve:
1. **page_name**: Make it clear and voice-friendly
2. **category**: Assign appropriate category (Main/Product/Service/Resource/About/Support/Information/etc)
3. **description**: Write 2-3 sentences explaining page content and purpose
4. **keywords**: Extract 5-10 relevant keywords for voice matching (as array)
5. **parent**: If it's a subpage, identify the parent page name
6. **importance**: Assess as high/medium/low based on content depth and relevance

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
}

Return ONLY valid JSON, no markdown formatting.`;

    const userPrompt = `Enhance this pre-structured knowledge base with better descriptions, categories, and hierarchy.

WEBSITE: ${websiteUrl}
PAGES TO ENHANCE: ${preStructuredPages.length}

PRE-STRUCTURED PAGES (you must return ALL of these with enhancements):
${JSON.stringify(preStructuredPages, null, 2)}

INSTRUCTIONS:
- Return ALL ${preStructuredPages.length} pages
- Improve page names, descriptions, keywords (as arrays), categories
- Identify parent-child relationships from URL structure
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
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
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

    // Ensure AI didn't drop any pages (100% coverage validation)
    if (structuredData.pages.length !== preStructuredPages.length) {
      console.error(`⚠️ AI returned ${structuredData.pages.length} pages but expected ${preStructuredPages.length}`);
      
      // Find missing page URLs
      const returnedUrls = new Set(structuredData.pages.map((p: any) => p.url));
      const missingPages = preStructuredPages.filter((p: any) => 
        !returnedUrls.has(p.url)
      );
      
      // Re-add missing pages with basic data
      missingPages.forEach((missingPage: any) => {
        console.warn(`⚠️ Re-adding missing page: ${missingPage.page_name} (${missingPage.url})`);
        structuredData.pages.push(missingPage);
      });
      
      console.log(`✅ Re-added ${missingPages.length} missing pages`);
    }

    // Ensure no page has undefined URL
    structuredData.pages = structuredData.pages.filter((p: any) => {
      if (!p.url || p.url === 'undefined') {
        console.warn(`⚠️ Removing invalid page: ${p.page_name} (no URL)`);
        return false;
      }
      return true;
    });

    // Ensure keywords are arrays
    structuredData.pages = structuredData.pages.map((p: any) => ({
      ...p,
      keywords: Array.isArray(p.keywords) ? p.keywords : 
                typeof p.keywords === 'string' ? p.keywords.split(',').map((k: string) => k.trim()) :
                []
    }));

    console.log(`✅ Final knowledge base contains ${structuredData.pages.length} pages (100% URL coverage)`);

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
