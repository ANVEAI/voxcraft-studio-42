import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🚀 Function started - create-vapi-assistant');
  
  if (req.method === 'OPTIONS') {
    console.log('📋 CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📨 Parsing request body...');
    const body = await req.json();
    console.log('✅ Request body parsed successfully');
    const { assistantData, selectedVoice, files } = body;

    const VAPI_PRIVATE_KEY = Deno.env.get('VAPI_PRIVATE_KEY');
    console.log('🔑 VAPI key check:', {
      exists: !!VAPI_PRIVATE_KEY,
      length: VAPI_PRIVATE_KEY?.length
    });
    
    if (!VAPI_PRIVATE_KEY) {
      console.log('❌ VAPI_PRIVATE_KEY not configured');
      throw new Error('VAPI_PRIVATE_KEY not configured');
    }

    console.log('🤖 Creating VAPI assistant:', assistantData?.botName || 'Unknown');

    // Simplified assistant creation - no file upload for now
    console.log('🛠️ Building assistant payload...');

    // Handle file uploads if provided
    const tools = [];
    if (files && files.length > 0) {
      console.log(`📁 Processing ${files.length} files for knowledge base`);
      
      const fileIds = [];
      for (const file of files) {
        try {
          console.log(`🔼 Uploading file: ${file.name}, type: ${file.type}, size: ${file.size}`);
          console.log(`📄 File data prefix: ${file.data ? file.data.substring(0, 50) : 'No data'}...`);
          
          if (!file.data || !file.data.includes(',')) {
            throw new Error('Invalid file data format - expected base64 data URL');
          }
          
          // Create proper FormData for file upload
          const formData = new FormData();
          
          // Convert base64 data URL to Blob for VAPI upload
          const base64Data = file.data.split(',')[1]; // Remove data:mime;base64, prefix
          if (!base64Data) {
            throw new Error('Failed to extract base64 data from file');
          }
          
          const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          const fileBlob = new Blob([binaryData], { type: file.type });
          
          console.log(`📦 Created blob with size: ${fileBlob.size} bytes`);
          formData.append('file', fileBlob, file.name);

          const fileUploadResponse = await fetch('https://api.vapi.ai/file', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
            },
            body: formData,
          });

          console.log(`📡 VAPI file upload response: ${fileUploadResponse.status} ${fileUploadResponse.statusText}`);

          if (fileUploadResponse.ok) {
            const fileData = await fileUploadResponse.json();
            fileIds.push(fileData.id);
            console.log(`✅ File uploaded successfully: ${file.name} -> ${fileData.id}`);
          } else {
            const errorText = await fileUploadResponse.text();
            console.error(`❌ Failed to upload file: ${file.name}`, errorText);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`💥 Error uploading file ${file.name}:`, errorMessage);
        }
      }

      // Create query tool if files were uploaded
      if (fileIds.length > 0) {
        console.log(`🛠️ Creating query tool with ${fileIds.length} files`);
        
        const queryTool = {
          type: "query",
          function: {
            name: `${assistantData.botName.toLowerCase().replace(/\s+/g, '-')}-knowledge`
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
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('💥 Error creating query tool:', errorMessage);
        }
      } else {
        console.log('⚠️ No files were successfully uploaded, skipping query tool creation');
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
        voiceId: selectedVoice?.voiceId || 'Elliot'
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

  } catch (error) {
    console.error('💥 Error in create-vapi-assistant:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('💥 Error stack:', errorStack);
    
    const errorResponse = {
      success: false,
      error: errorMessage
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