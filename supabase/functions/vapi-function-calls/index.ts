import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface VapiFunctionCallPayload {
  message: {
    timestamp: number;
    type: string;
    toolCalls: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: any;
      };
    }>;
  };
  call?: {
    id: string;
    assistantId: string;
  };
  assistant?: {
    id: string;
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

    // Debug payload structure
    console.log('[VAPI Function Call] Call object:', JSON.stringify(payload.call, null, 2));
    console.log('[VAPI Function Call] Assistant object:', JSON.stringify(payload.assistant, null, 2));

    // Extract function call details from VAPI payload
    const toolCall = payload.message?.toolCalls?.[0];
    if (!toolCall) {
      console.error('[VAPI Function Call] No tool calls found in payload');
      return new Response(JSON.stringify({ error: 'No tool calls found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const functionName = toolCall.function?.name;
    const parameters = toolCall.function?.arguments || {};
    const callId = toolCall.id;

    // Extract assistant ID from VAPI payload with multiple strategies
    let assistantId = payload.call?.assistantId || payload.assistant?.id;
    
    // Try alternative extraction paths
    if (!assistantId && payload.call?.id) {
      assistantId = payload.call.id;
      console.log('[VAPI Function Call] Using call.id as assistant ID:', assistantId);
    }
    
    // Try extracting from artifact or message context
    if (!assistantId && payload.message?.artifact?.assistant_id) {
      assistantId = payload.message.artifact.assistant_id;
      console.log('[VAPI Function Call] Using artifact assistant_id:', assistantId);
    }
    
    console.log('[VAPI Function Call] Final assistant ID:', assistantId);

    if (!functionName || !callId) {
      console.error('[VAPI Function Call] Missing required data:', { functionName, callId });
      return new Response(JSON.stringify({ error: 'Missing required function call data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!assistantId) {
      console.error('[VAPI Function Call] Assistant ID not found in payload');
      return new Response(JSON.stringify({ error: 'Assistant ID not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[VAPI Function Call] Processing function:', functionName, 'for assistant:', assistantId, 'with params:', parameters);

    // Send function call to client via Supabase Realtime
    const functionCallMessage = {
      type: 'function_call',
      functionName,
      parameters,
      callId,
      assistantId,
      timestamp: new Date().toISOString()
    };

    // Broadcast to specific assistant channel using bot_${assistantId} format
    const channelName = `bot_${assistantId}`;
    const channel = supabase.channel(channelName);
    
    // Send the function call to the embedding script
    await channel.send({
      type: 'broadcast',
      event: 'function_call',
      payload: functionCallMessage
    });

    console.log('[VAPI Function Call] Function call broadcasted to channel:', channelName, 'function:', functionName);

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