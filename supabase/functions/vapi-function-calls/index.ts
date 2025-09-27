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
    
    // Enhanced assistant ID extraction for VAPI webhook payload structure
    const assistantFromBody =
      payload?.message?.artifact?.call?.assistantId ||     // VAPI: From nested call object
      payload?.message?.artifact?.assistant?.id ||         // VAPI: From nested assistant object
      payload?.assistant?.id ||                            // Direct from assistant object
      payload?.call?.assistantId ||                       // From call object
      payload?.assistantId ||                             // Direct assistantId field
      payload?.assistant ||                               // If assistant is just a string
      payload?.botId ||
      payload?.bot?.id ||
      payload?.message?.assistantId;

    const assistantId = assistantFromQuery || assistantFromHeader || assistantFromBody || null;
    
    // Enhanced logging to debug assistant ID extraction
    console.log('[VAPI Function Call] Assistant ID extraction:', {
      assistantFromQuery,
      assistantFromHeader,
      assistantFromBody,
      finalAssistantId: assistantId,
      payloadKeys: Object.keys(payload || {}),
      assistantObject: payload?.assistant,
      callObject: payload?.call
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

    // Extract sessionId from function call parameters for session isolation
    let sessionId = params?.sessionId;
    
    // CRITICAL FIX: VAPI variable substitution not working - literal "{{sessionId}}" being passed
    // Fallback strategies for session isolation
    let effectiveSessionId = sessionId;
    
    // Strategy 1: Check if VAPI failed to substitute sessionId variable
    if (sessionId === '{{sessionId}}' || !sessionId) {
      console.log('[VAPI Function Call] ⚠️ VAPI variable substitution failed, sessionId:', sessionId);
      
      // Strategy 2: Try to extract sessionId from VAPI call ID or assistant context
      effectiveSessionId = payload?.call?.id || 
                          payload?.artifact?.call?.id || 
                          `fallback_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      
      console.log('[VAPI Function Call] 🔄 Using fallback sessionId:', effectiveSessionId);
    }
    
    console.log('[VAPI Function Call] Session isolation debug:', { 
      assistantId, 
      originalSessionId: sessionId, 
      effectiveSessionId,
      payloadKeys: Object.keys(payload || {}),
      callId: payload?.call?.id,
      artifactCallId: payload?.artifact?.call?.id
    });

    // Determine channel name with session isolation priority:
    // 1. Session-specific: vapi:assistantId:sessionId
    // 2. Assistant-specific: vapi:assistantId  
    // 3. Global fallback: vapi_function_calls
    let channelName;
    if (assistantId && effectiveSessionId && effectiveSessionId !== '{{sessionId}}') {
      channelName = `vapi:${assistantId}:${effectiveSessionId}`;
    } else if (assistantId) {
      channelName = `vapi:${assistantId}`;
    } else {
      channelName = 'vapi_function_calls';
    }
    
    console.log('[VAPI Function Call] Broadcasting', { 
      functionName, 
      channelName, 
      originalParams: params, 
      originalSessionId: sessionId,
      effectiveSessionId,
      vapiCallId: payload?.call?.id
    });

    const functionCallMessage = {
      functionName,
      params: {
        ...params,
        sessionId: effectiveSessionId // Use effective sessionId for client matching
      },
      callId,
      assistantId: assistantId || undefined,
      sessionId: effectiveSessionId, // Use effective sessionId
      originalSessionId: sessionId, // Keep original for debugging
      vapiCallId: payload?.call?.id,
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

    console.log('[VAPI Function Call] Function call broadcasted:', { 
      functionName, 
      channelName, 
      effectiveSessionId,
      originalSessionId: sessionId,
      vapiCallId: payload?.call?.id
    });

    return new Response(
      JSON.stringify({ ok: true, status: 'broadcasted', channel: channelName, functionName, callId, sessionId }),
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