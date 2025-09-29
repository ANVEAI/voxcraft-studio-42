// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to parse JWT token and extract user_id
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
  console.log(`${req.method} /vapi-query-tool`);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const userId = parseClerkToken(token);
    if (!userId) {
      throw new Error('Invalid authentication token');
    }

    // Get VAPI private key
    const vapiPrivateKey = Deno.env.get('VAPI_PRIVATE_KEY');
    if (!vapiPrivateKey) {
      throw new Error('VAPI_PRIVATE_KEY not configured');
    }

    const { assistantId, toolName, description, fileIds } = await req.json();

    if (!assistantId || !toolName || !fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('Missing required fields: assistantId, toolName, and fileIds array');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify assistant belongs to user
    const { data: assistant, error: assistantError } = await supabase
      .from('assistants')
      .select('id, vapi_assistant_id')
      .eq('id', assistantId)
      .eq('user_id', userId)
      .single();

    if (assistantError || !assistant) {
      throw new Error('Assistant not found or access denied');
    }

    console.log(`Creating query tool for assistant: ${assistant.vapi_assistant_id}`);

    // Create query tool in VAPI
    const queryToolPayload = {
      type: "query",
      function: {
        name: toolName.toLowerCase().replace(/\s+/g, '-')
      },
      knowledgeBases: [
        {
          provider: "google",
          name: `${toolName.toLowerCase().replace(/\s+/g, '-')}-kb`,
          description: description || `Knowledge base for ${toolName}`,
          fileIds: fileIds
        }
      ]
    };

    console.log('Creating query tool with payload:', JSON.stringify(queryToolPayload, null, 2));

    const toolResponse = await fetch('https://api.vapi.ai/tool/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vapiPrivateKey}`,
      },
      body: JSON.stringify(queryToolPayload),
    });

    if (!toolResponse.ok) {
      const errorText = await toolResponse.text();
      console.error('VAPI tool creation error:', errorText);
      throw new Error(`Failed to create query tool in VAPI: ${toolResponse.status} ${errorText}`);
    }

    const toolData = await toolResponse.json();
    console.log('VAPI tool creation response:', toolData);

    // Update assistant to include the new tool
    if (assistant.vapi_assistant_id) {
      console.log(`Updating assistant ${assistant.vapi_assistant_id} with tool ${toolData.id}`);
      
      // Get current assistant data from VAPI
      const assistantResponse = await fetch(`https://api.vapi.ai/assistant/${assistant.vapi_assistant_id}`, {
        headers: {
          'Authorization': `Bearer ${vapiPrivateKey}`,
        },
      });

      if (assistantResponse.ok) {
        const assistantData = await assistantResponse.json();
        
        // Add the new tool to existing tools
        const updatedTools = assistantData.tools || [];
        updatedTools.push({ id: toolData.id });

        // Update the assistant with the new tools
        const updateResponse = await fetch(`https://api.vapi.ai/assistant/${assistant.vapi_assistant_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${vapiPrivateKey}`,
          },
          body: JSON.stringify({
            tools: updatedTools
          }),
        });

        if (!updateResponse.ok) {
          const updateErrorText = await updateResponse.text();
          console.error('Failed to update assistant with tool:', updateErrorText);
          // Don't throw error here, tool was created successfully
        } else {
          console.log('Successfully updated assistant with new tool');
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        tool: {
          id: toolData.id,
          name: toolName,
          type: 'query',
          knowledgeBases: queryToolPayload.knowledgeBases,
          fileIds: fileIds
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in vapi-query-tool function:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});