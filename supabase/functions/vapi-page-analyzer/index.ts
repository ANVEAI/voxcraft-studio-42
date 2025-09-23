import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PageData {
  pageTitle: string;
  pageURL: string;
  headings: Array<{level: number, text: string}>;
  navigation: Array<{text: string, href: string}>;
  forms: Array<{id: string, inputs: Array<{type: string, name: string, label: string}>}>;
  interactiveElements: Array<{type: string, text: string, id: string, selector: string}>;
  contentSections: Array<{heading: string, content: string}>;
  pageType: string;
  keyContent: string;
}

function analyzePageContext(pageData: PageData): string {
  const {
    pageTitle,
    pageURL,
    headings,
    navigation,
    forms,
    interactiveElements,
    contentSections,
    pageType,
    keyContent
  } = pageData;

  let contextSummary = `📄 Current Page Analysis:
Title: "${pageTitle}"
URL: ${pageURL}
Page Type: ${pageType}

`;

  // Navigation context
  if (navigation.length > 0) {
    contextSummary += `🧭 Available Navigation:
${navigation.map(nav => `- "${nav.text}" (${nav.href})`).join('\n')}

`;
  }

  // Interactive elements context
  if (interactiveElements.length > 0) {
    contextSummary += `🎯 Interactive Elements Available:
${interactiveElements.map(el => `- ${el.type}: "${el.text}" (${el.selector})`).join('\n')}

`;
  }

  // Forms context
  if (forms.length > 0) {
    contextSummary += `📝 Forms Available:
${forms.map(form => 
  `- Form ${form.id}: ${form.inputs.map(input => `${input.label || input.name} (${input.type})`).join(', ')}`
).join('\n')}

`;
  }

  // Content structure
  if (headings.length > 0) {
    contextSummary += `📋 Page Structure:
${headings.map(h => `${'  '.repeat(h.level - 1)}- ${h.text}`).join('\n')}

`;
  }

  contextSummary += `📖 Key Content Summary:
${keyContent}

🎯 Voice Command Context:
Based on this page analysis, I can help users:
- Navigate to any of the listed navigation items
- Interact with the available buttons, links, and form elements
- Find content within the structured sections
- Perform page-specific actions based on the ${pageType} page type

I will use this context to provide accurate voice navigation assistance throughout our session.`;

  return contextSummary;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📊 Page analyzer function called');
    
    const body = await req.json();
    console.log('📨 Received body:', JSON.stringify(body, null, 2));

    // Extract page data from VAPI function call format
    const pageData = body.message?.call?.parameters?.pageData || body.pageData;
    
    if (!pageData) {
      console.error('❌ No page data received');
      return new Response(JSON.stringify({ 
        error: 'No page data provided' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🔍 Processing page data for:', pageData.pageTitle);

    // Analyze the page context
    const contextAnalysis = analyzePageContext(pageData);
    
    console.log('✅ Generated context analysis:', contextAnalysis.substring(0, 200) + '...');

    // Return the analysis in VAPI function response format
    const response = {
      result: contextAnalysis,
      success: true,
      pageContext: {
        title: pageData.pageTitle,
        type: pageData.pageType,
        elementsCount: pageData.interactiveElements?.length || 0,
        hasNavigation: pageData.navigation?.length > 0,
        hasForms: pageData.forms?.length > 0
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in page analyzer:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to analyze page context',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});