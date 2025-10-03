import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-vapi-assistant-id, x-assistant-id, x-assistant',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function safeJsonParse(maybeJson: unknown) {
  if (typeof maybeJson !== 'string') return maybeJson ?? {};
  try {
    return JSON.parse(maybeJson);
  } catch {
    console.warn('[VAPI Function Call] Failed to parse arguments JSON string. Sending as empty object.');
    return {};
  }
}

serve(async (req) => {
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[VAPI Function Call] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    console.log('[VAPI Function Call] Payload:', JSON.stringify(payload, null, 2));

    // Extract call ID from VAPI webhook payload structure
    const vapiCallId = 
      payload?.message?.call?.id ||                       // VAPI: From nested call object
      payload?.call?.id ||                                // From call object
      payload?.callId ||                                  // Direct callId field
      payload?.message?.callId;                           // From message object

    // Enhanced logging to debug call ID extraction
    console.log('[VAPI Function Call] Call ID extraction:', {
      vapiCallId,
      payloadKeys: Object.keys(payload || {}),
      messageObject: payload?.message,
      callObject: payload?.call,
      messageCallObject: payload?.message?.call
    });

    const toolCall = payload?.message?.toolCalls?.[0] ?? null;
    if (!toolCall) {
      console.error('[VAPI Function Call] No tool calls found in payload');
      return new Response(JSON.stringify({ error: 'No tool calls found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const functionName: string | undefined = toolCall.function?.name;
    const rawArguments = toolCall.function?.arguments ?? {};
    const params = safeJsonParse(rawArguments);
    const callId: string | undefined = toolCall.id;

    if (!functionName || !callId) {
      console.error('[VAPI Function Call] Missing required data:', { functionName, callId });
      return new Response(JSON.stringify({ error: 'Missing required function call data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // VAPI-Native Session Isolation: Use call ID for unique channels
    if (!vapiCallId) {
      console.error('[VAPI Function Call] Missing VAPI call ID for session isolation');
      return new Response(JSON.stringify({ error: 'Missing VAPI call ID for session isolation' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const channelName = `vapi:call:${vapiCallId}`;
    console.log('[VAPI Function Call] Broadcasting to session-specific channel:', { functionName, channelName, vapiCallId, params });

    const functionCallMessage = {
      functionName,
      params, // IMPORTANT: "params" to match client dispatcher
      callId,
      vapiCallId,
      timestamp: new Date().toISOString()
    };

    const channel = supabase.channel(channelName);
    const sendResult = await channel.send({
      type: 'broadcast',
      event: 'function_call',
      payload: functionCallMessage
    } as any);

    // Also broadcast to discovery channel for call ID sharing
    const discoveryChannel = `vapi:discovery:${payload?.message?.assistant?.id || 'unknown'}`;
    const discoveryMessage = {
      type: 'call_id_discovery',
      vapiCallId,
      assistantId: payload?.message?.assistant?.id,
      timestamp: new Date().toISOString()
    };
    
    await supabase.channel(discoveryChannel).send({
      type: 'broadcast',
      event: 'call_discovery',
      payload: discoveryMessage
    } as any);

    if (sendResult === 'error') {
      console.error('[VAPI Function Call] Broadcast error:', sendResult);
      return new Response(JSON.stringify({ error: 'Broadcast failed', details: sendResult }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[VAPI Function Call] Function call broadcasted to session:', { functionName, channelName, vapiCallId });

    return new Response(
      JSON.stringify({ ok: true, status: 'broadcasted', channel: channelName, functionName, callId, vapiCallId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('[VAPI Function Call] Error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});