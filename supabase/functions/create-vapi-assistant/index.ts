// @ts-nocheck
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📥 Request received for assistant creation');

    const body = await req.json();
    const { assistantData, files } = body;
    
    // Get Supabase URL from environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://mdkcdjltvfpthqudhhmx.supabase.co';
    
    console.log('🔧 Assistant data:', JSON.stringify(assistantData, null, 2));
    console.log('📁 Files to upload:', files?.length || 0);

    const VAPI_PRIVATE_KEY = Deno.env.get('VAPI_PRIVATE_KEY');
    if (!VAPI_PRIVATE_KEY) {
      console.error('❌ VAPI_PRIVATE_KEY not configured');
      throw new Error('VAPI_PRIVATE_KEY not configured');
    }

    console.log('🔑 VAPI Key available:', !!VAPI_PRIVATE_KEY);

    // Handle file uploads to VAPI if provided
    const tools = [];
    let fileIds = [];

    if (files && files.length > 0) {
      console.log(`📤 Uploading ${files.length} files to VAPI...`);

      // Upload files to VAPI
      for (const file of files) {
        try {
          console.log(`📤 Uploading file: ${file.name}`);
          
          // Convert base64 to blob
          const binaryString = atob(file.content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          const formData = new FormData();
          formData.append('file', new Blob([bytes], { type: file.type }), file.name);

          const uploadResponse = await fetch('https://api.vapi.ai/file', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
            },
            body: formData,
          });

          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            fileIds.push(uploadResult.id);
            console.log(`✅ File uploaded successfully: ${uploadResult.id}`);
          } else {
            const errorText = await uploadResponse.text();
            console.error(`❌ Failed to upload file ${file.name}:`, uploadResponse.status, errorText);
          }
        } catch (error) {
          console.error(`💥 Error uploading file ${file.name}:`, (error as Error).message);
        }
      }

      console.log(`📁 Successfully uploaded ${fileIds.length} files to VAPI`);

      // Create a query tool if we have uploaded files
      if (fileIds.length > 0) {
        console.log('🔧 Creating query tool with uploaded files...');
        
        const queryTool = {
          type: "query",
          queryKnowledgeBase: {
            topK: 10,
            fileIds: fileIds,
            enabled: true
          },
          knowledgeBases: [
            {
              provider: "google",
              name: `${assistantData.botName.toLowerCase().replace(/\s+/g, '-')}-kb`,
              description: `Knowledge base for ${assistantData.botName} - contains information and documents to help answer user queries accurately`,
              fileIds: fileIds
            }
          ]
        };

        console.log('🧰 Query tool payload:', JSON.stringify(queryTool, null, 2));

        try {
          const toolResponse = await fetch('https://api.vapi.ai/tool', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
            },
            body: JSON.stringify(queryTool),
          });

          if (toolResponse.ok) {
            const toolData = await toolResponse.json();
            tools.push(toolData.id); // Store just the tool ID, not an object
            console.log(`🔧 Query tool created successfully: ${toolData.id}`);
          } else {
            const toolErrorText = await toolResponse.text();
            console.error('❌ Failed to create query tool:', toolResponse.status, toolErrorText);
          }
        } catch (error) {
          console.error('💥 Error creating query tool:', (error as Error).message);
        }
      } else {
        console.log('⚠️ No files were successfully uploaded, skipping query tool creation');
      }
    }

    // Add voice navigation function tools if this is a voice navigation assistant
    const isVoiceNavigation = assistantData.systemPromptTemplate === 'voice-navigation' || 
                              assistantData.systemPrompt.includes('scroll_page') ||
                              assistantData.systemPrompt.includes('click_element');

    if (isVoiceNavigation) {
      console.log('🧭 Adding voice navigation function tools...');
      
      // Create function tools for voice navigation
      const navigationTools = [
        {
          async: false,
          function: {
            name: 'scroll_page',
            description: 'Scroll the page in the specified direction',
            parameters: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'Unique session identifier for isolation - REQUIRED'
                },
                direction: {
                  type: 'string',
                  enum: ['up', 'down', 'top', 'bottom'],
                  description: 'Direction to scroll the page'
                }
              },
              required: ['sessionId', 'direction']
            }
          },
          server: {
            url: `https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/vapi-function-calls`
          }
        },
        {
          async: false,
          function: {
            name: 'click_element',
            description: 'Click a button, link, or interactive element on the page',
            parameters: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'Unique session identifier for isolation - REQUIRED'
                },
                selector: {
                  type: 'string',
                  description: 'CSS selector for the element to click'
                }
              },
              required: ['sessionId', 'selector']
            }
          },
          server: {
            url: `https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/vapi-function-calls`
          }
        },
        {
          async: false,
          function: {
            name: 'fill_field',
            description: 'Fill an input field with the specified value',
            parameters: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'Unique session identifier for isolation - REQUIRED'
                },
                selector: {
                  type: 'string',
                  description: 'CSS selector for the input field'
                },
                value: {
                  type: 'string',
                  description: 'Value to fill in the field'
                }
              },
              required: ['sessionId', 'selector', 'value']
            }
          },
          server: {
            url: `https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/vapi-function-calls`
          }
        },
        {
          async: false,
          function: {
            name: 'toggle_element',
            description: 'Toggle a checkbox, switch, or similar UI control',
            parameters: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'Unique session identifier for isolation - REQUIRED'
                },
                selector: {
                  type: 'string',
                  description: 'CSS selector for the element to toggle'
                }
              },
              required: ['sessionId', 'selector']
            }
          },
          server: {
            url: `https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/vapi-function-calls`
          }
        }
      ];

      // Create each navigation tool
      for (const toolDef of navigationTools) {
        console.log(`🔧 Creating tool: ${toolDef.function.name}`);
        
        try {
          const toolResponse = await fetch('https://api.vapi.ai/tool', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
            },
            body: JSON.stringify(toolDef),
          });

          if (toolResponse.ok) {
            const toolData = await toolResponse.json();
            tools.push(toolData.id);
            console.log(`✅ Created tool: ${toolDef.function.name} with ID: ${toolData.id}`);
          } else {
            const toolErrorText = await toolResponse.text();
            console.error(`❌ Failed to create tool ${toolDef.function.name}:`, toolResponse.status, toolErrorText);
          }
        } catch (error) {
          console.error(`💥 Error creating tool ${toolDef.function.name}:`, (error as Error).message);
        }
      }
    }
    
    const payload = {
      name: assistantData.botName || 'Voice Assistant',
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: assistantData.systemPrompt || 'You are a helpful voice assistant.'
          }
        ]
      },
      voice: {
        provider: 'vapi',
        voiceId: assistantData.voice || 'Elliot'
      },
      firstMessage: assistantData.welcomeMessage || 'Hello! How can I help you today?',
      // Explicitly disable Krisp noise cancellation to prevent WORKLET_NOT_SUPPORTED errors
      backgroundSpeechDenoisingPlan: {
        smartDenoisingPlan: {
          enabled: false
        }
      }
    };

    console.log('📡 Making VAPI create request...');
    const response = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('📡 VAPI response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ VAPI API error:', errorText);
      throw new Error(`VAPI API error: ${response.status} - ${errorText}`);
    }

    const vapiAssistant = await response.json();
    console.log('✅ VAPI assistant created with ID:', vapiAssistant.id);

    // Attach tools to the assistant using PATCH request with toolIds
    if (tools.length > 0) {
      console.log(`🔧 Attaching ${tools.length} tools to assistant...`);
      
      const updatePayload = {
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: assistantData.systemPrompt || 'You are a helpful voice assistant.'
            }
          ],
          toolIds: tools
        }
      };

      const updateResponse = await fetch(`https://api.vapi.ai/assistant/${vapiAssistant.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });

      console.log('📡 VAPI update response:', {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        ok: updateResponse.ok
      });

      if (updateResponse.ok) {
        console.log(`✅ Successfully attached ${tools.length} tools to assistant`);
      } else {
        const updateErrorText = await updateResponse.text();
        console.error('❌ Failed to attach tools to assistant:', updateErrorText);
        // Don't throw error here, assistant was created successfully
      }
    }

    console.log('📤 Sending success response');
    return new Response(JSON.stringify({
      success: true,
      vapiAssistantId: vapiAssistant.id,
      assistant: vapiAssistant,
      filesUploaded: files ? files.length : 0,
      toolsCreated: tools.length
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

  } catch (error: any) {
    console.error('💥 Error in create-vapi-assistant:', error);
    console.error('💥 Error stack:', (error as Error).stack);
    
    const errorResponse = {
      success: false,
      error: (error as Error).message
    };
    
    console.log('📤 Sending error response:', errorResponse);
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});