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

    // Try to find assistantId (query, headers, body)
    const url = new URL(req.url);
    const assistantFromQuery =
      url.searchParams.get('assistant') ||
      url.searchParams.get('assistantId') ||
      url.searchParams.get('botId');
    const assistantFromHeader =
      req.headers.get('x-vapi-assistant-id') ||
      req.headers.get('x-assistant-id') ||
      req.headers.get('x-assistant');
    const assistantFromBody =
      payload?.assistantId ||
      payload?.assistant?.id ||
      payload?.assistant ||
      payload?.botId ||
      payload?.bot?.id ||
      payload?.message?.assistantId;
    const assistantId = assistantFromQuery || assistantFromHeader || assistantFromBody || null;

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

    const channelName = assistantId ? `vapi:${assistantId}` : 'vapi_function_calls';
    console.log('[VAPI Function Call] Broadcasting', { functionName, channelName, params });

    const functionCallMessage = {
      functionName,
      params, // IMPORTANT: "params" to match client dispatcher
      callId,
      assistantId: assistantId || undefined,
      timestamp: new Date().toISOString()
    };

    const channel = supabase.channel(channelName);
    const sendResult = await channel.send({
      type: 'broadcast',
      event: 'function_call',
      payload: functionCallMessage
    } as any);

    if (sendResult?.error) {
      console.error('[VAPI Function Call] Broadcast error:', sendResult.error);
      return new Response(JSON.stringify({ error: 'Broadcast failed', details: sendResult.error }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[VAPI Function Call] Function call broadcasted:', { functionName, channelName });

    return new Response(
      JSON.stringify({ ok: true, status: 'broadcasted', channel: channelName, functionName, callId }),
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