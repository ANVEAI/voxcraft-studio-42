import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
  console.log(`${req.method} /vapi-cleanup-assistant-tools`);

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

    const { assistantId } = await req.json();

    if (!assistantId) {
      throw new Error('Missing required field: assistantId');
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

    console.log(`🧹 Cleaning up tools for assistant: ${assistant.vapi_assistant_id}`);

    // Get current assistant configuration from VAPI
    const assistantResponse = await fetch(`https://api.vapi.ai/assistant/${assistant.vapi_assistant_id}`, {
      headers: {
        'Authorization': `Bearer ${vapiPrivateKey}`,
      },
    });

    if (!assistantResponse.ok) {
      throw new Error(`Failed to get assistant from VAPI: ${assistantResponse.status}`);
    }

    const assistantData = await assistantResponse.json();
    const currentToolIds = assistantData.model?.toolIds || assistantData.tools || [];
    
    console.log(`🔍 Current tool IDs: ${JSON.stringify(currentToolIds)}`);

    // Check which tools actually exist
    const validToolIds = [];
    const invalidToolIds = [];

    for (const toolId of currentToolIds) {
      try {
        const toolResponse = await fetch(`https://api.vapi.ai/tool/${toolId}`, {
          headers: {
            'Authorization': `Bearer ${vapiPrivateKey}`,
          },
        });

        if (toolResponse.ok) {
          validToolIds.push(toolId);
          console.log(`✅ Tool ${toolId} exists`);
        } else {
          invalidToolIds.push(toolId);
          console.log(`❌ Tool ${toolId} does not exist (status: ${toolResponse.status})`);
        }
      } catch (error) {
        invalidToolIds.push(toolId);
        console.log(`❌ Tool ${toolId} check failed: ${error.message}`);
      }
    }

    console.log(`✅ Valid tools: ${JSON.stringify(validToolIds)}`);
    console.log(`❌ Invalid tools: ${JSON.stringify(invalidToolIds)}`);

    // Update assistant with only valid tools
    if (invalidToolIds.length > 0) {
      const existingModel = assistantData.model || {};
      
      const updateResponse = await fetch(`https://api.vapi.ai/assistant/${assistant.vapi_assistant_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${vapiPrivateKey}`,
        },
        body: JSON.stringify({
          model: {
            ...existingModel,
            toolIds: validToolIds,
          }
        }),
      });

      if (!updateResponse.ok) {
        const updateErrorText = await updateResponse.text();
        console.error('Failed to update assistant:', updateErrorText);
        throw new Error(`Failed to update assistant: ${updateResponse.status} ${updateErrorText}`);
      }

      console.log(`🧹 Successfully cleaned up assistant. Removed ${invalidToolIds.length} invalid tools.`);
    } else {
      console.log(`✅ No cleanup needed. All tools are valid.`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        validToolIds,
        invalidToolIds,
        cleanupPerformed: invalidToolIds.length > 0,
        message: invalidToolIds.length > 0 
          ? `Cleaned up ${invalidToolIds.length} invalid tools` 
          : 'No cleanup needed - all tools are valid'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in vapi-cleanup-assistant-tools function:', error);
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