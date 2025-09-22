import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface VapiFunctionCallPayload {
  type: string;
  functionCall: {
    name: string;
    parameters: any;
  };
  call: {
    id: string;
    assistant?: {
      id: string;
    };
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    console.log('[VAPI Function Call] Webhook received');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    const payload: VapiFunctionCallPayload = await req.json();
    console.log('[VAPI Function Call] Payload:', JSON.stringify(payload, null, 2));

    // Extract function call details
    const functionName = payload.functionCall?.name;
    const parameters = payload.functionCall?.parameters || {};
    const callId = payload.call?.id;
    const assistantId = payload.call?.assistant?.id;

    if (!functionName || !callId || !assistantId) {
      console.error('[VAPI Function Call] Missing required data:', { functionName, callId, assistantId });
      return new Response(JSON.stringify({ error: 'Missing required function call data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Find the assistant to get bot ID for targeting
    const { data: assistant, error: assistantError } = await supabase
      .from('assistants')
      .select('id, user_id')
      .eq('vapi_assistant_id', assistantId)
      .single();

    if (assistantError || !assistant) {
      console.error('[VAPI Function Call] Assistant not found for VAPI ID:', assistantId);
      return new Response(JSON.stringify({ error: 'Assistant not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[VAPI Function Call] Processing function:', functionName, 'for assistant:', assistant.id);

    // Send function call to client via Supabase Realtime
    const functionCallMessage = {
      type: 'function_call',
      functionName,
      parameters,
      callId,
      assistantId: assistant.id,
      timestamp: new Date().toISOString()
    };

    // Use Supabase Realtime to broadcast to the specific bot channel
    const channel = supabase.channel(`bot_${assistant.id}`);
    
    // Send the function call to the embedding script
    await channel.send({
      type: 'broadcast',
      event: 'function_call',
      payload: functionCallMessage
    });

    console.log('[VAPI Function Call] Function call broadcasted to channel:', `bot_${assistant.id}`);

    // Return success response to VAPI
    return new Response(JSON.stringify({ 
      success: true,
      message: `Function ${functionName} executed`,
      result: `Function call sent to client` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VAPI Function Call] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});