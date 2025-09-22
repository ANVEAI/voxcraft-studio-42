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

    if (!functionName || !callId) {
      console.error('[VAPI Function Call] Missing required data:', { functionName, callId });
      return new Response(JSON.stringify({ error: 'Missing required function call data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // For now, we'll broadcast to all assistants since VAPI doesn't provide assistant ID in the payload
    // In production, you might want to include assistant ID in the webhook URL or headers
    console.log('[VAPI Function Call] Processing function:', functionName, 'with params:', parameters);

    // Send function call to client via Supabase Realtime
    const functionCallMessage = {
      type: 'function_call',
      functionName,
      parameters,
      callId,
      timestamp: new Date().toISOString()
    };

    // Broadcast to a general channel for now - in production you'd want to map this to specific assistants
    const channel = supabase.channel('vapi_function_calls');
    
    // Send the function call to the embedding script
    await channel.send({
      type: 'broadcast',
      event: 'function_call',
      payload: functionCallMessage
    });

    console.log('[VAPI Function Call] Function call broadcasted:', functionName);

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