import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to parse Clerk JWT token
function parseClerkToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    return payload.sub || null;
  } catch (error) {
    console.error('Error parsing token:', error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔧 Creating page analyzer tool function called');

    // Get authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract and validate user ID from token
    const token = authHeader.replace('Bearer ', '');
    const userId = parseClerkToken(token);
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('👤 Creating tool for user:', userId);

    // Get request body
    const { assistantId, toolName = "Page Context Analyzer", description = "Analyzes the current webpage structure and content for better voice navigation" } = await req.json();

    if (!assistantId) {
      return new Response(JSON.stringify({ error: 'Assistant ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify assistant ownership
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: assistant, error: assistantError } = await supabase
      .from('assistants')
      .select('id')
      .eq('id', assistantId)
      .eq('user_id', userId)
      .single();

    if (assistantError || !assistant) {
      console.error('❌ Assistant verification failed:', assistantError);
      return new Response(JSON.stringify({ error: 'Assistant not found or access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Assistant ownership verified');

    // Get VAPI private key
    const vapiPrivateKey = Deno.env.get('VAPI_PRIVATE_KEY');
    if (!vapiPrivateKey) {
      throw new Error('VAPI_PRIVATE_KEY not found in environment variables');
    }

    // Create the page analyzer tool
    const toolPayload = {
      type: "function",
      function: {
        name: "analyze_page_context",
        description: description,
        parameters: {
          type: "object",
          properties: {
            pageData: {
              type: "object",
              description: "Complete page analysis data including DOM structure, content, and interactive elements",
              properties: {
                pageTitle: { type: "string" },
                pageURL: { type: "string" },
                headings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      level: { type: "number" },
                      text: { type: "string" }
                    }
                  }
                },
                navigation: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string" },
                      href: { type: "string" }
                    }
                  }
                },
                interactiveElements: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      text: { type: "string" },
                      id: { type: "string" },
                      selector: { type: "string" }
                    }
                  }
                },
                forms: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      inputs: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string" },
                            name: { type: "string" },
                            label: { type: "string" }
                          }
                        }
                      }
                    }
                  }
                },
                contentSections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      heading: { type: "string" },
                      content: { type: "string" }
                    }
                  }
                },
                pageType: { type: "string" },
                keyContent: { type: "string" }
              }
            }
          },
          required: ["pageData"]
        }
      },
      server: {
        url: `https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/vapi-page-analyzer`
      }
    };

    console.log('📝 Creating tool with payload:', JSON.stringify(toolPayload, null, 2));

    // Create the tool via VAPI API
    const toolResponse = await fetch('https://api.vapi.ai/tool', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiPrivateKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toolPayload),
    });

    if (!toolResponse.ok) {
      const errorText = await toolResponse.text();
      console.error('❌ VAPI tool creation failed:', errorText);
      throw new Error(`Failed to create VAPI tool: ${toolResponse.status} ${errorText}`);
    }

    const createdTool = await toolResponse.json();
    console.log('✅ Tool created successfully:', createdTool.id);

    // Get current assistant data from VAPI
    const assistantResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      headers: {
        'Authorization': `Bearer ${vapiPrivateKey}`,
      },
    });

    if (!assistantResponse.ok) {
      throw new Error(`Failed to fetch assistant: ${assistantResponse.status}`);
    }

    const assistantData = await assistantResponse.json();
    
    // Add the new tool to the assistant's tools
    const updatedTools = [...(assistantData.tools || []), createdTool.id];

    // Update the assistant with the new tool
    const updateResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${vapiPrivateKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tools: updatedTools,
      }),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('❌ Failed to update assistant:', errorText);
      throw new Error(`Failed to update assistant: ${updateResponse.status} ${errorText}`);
    }

    console.log('✅ Assistant updated with page analyzer tool');

    return new Response(JSON.stringify({
      success: true,
      toolId: createdTool.id,
      toolName: createdTool.function.name,
      message: 'Page analyzer tool created and added to assistant successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error creating page analyzer tool:', error);
    return new Response(JSON.stringify({
      error: 'Failed to create page analyzer tool',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});