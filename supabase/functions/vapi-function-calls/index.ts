// @ts-nocheck
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

    // Enhanced session isolation with fallback
    let sessionId = params?.sessionId;
    let channelName;
    
    console.log('[VAPI Function Call] Session isolation debug:', {
      functionName,
      callId,
      sessionId,
      assistantId,
      params,
      toolCallStructure: {
        hasSessionId: !!sessionId,
        paramsKeys: Object.keys(params || {}),
        rawArguments: typeof rawArguments
      }
    });

    // Handle VAPI variable substitution issues - fallback to call-based isolation
    if (!sessionId || sessionId === '{{sessionId}}') {
      console.warn('[VAPI Function Call] SessionId not properly substituted by VAPI, using call-based isolation');
      
      // Extract call ID from payload for fallback isolation
      const callIdFromPayload = payload?.message?.artifact?.call?.id || 
                               payload?.call?.id || 
                               payload?.message?.callId ||
                               callId;
      
      if (callIdFromPayload) {
        sessionId = `call_${callIdFromPayload}`;
        channelName = `vapi:session:${sessionId}`;
        console.log('[VAPI Function Call] Using call-based session isolation:', { sessionId, channelName });
      } else {
        console.error('[VAPI Function Call] No valid session identifier found');
        return new Response(JSON.stringify({ 
          error: 'Session isolation error: No valid session identifier found',
          debug: {
            functionName,
            params,
            callData: {
              callId,
              payloadCallId: payload?.call?.id,
              messageCallId: payload?.message?.callId,
              artifactCallId: payload?.message?.artifact?.call?.id
            },
            expectedFormat: 'Tool calls must include "sessionId": "{{sessionId}}" parameter or have valid call ID'
          }
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else {
      // Use provided session ID
      channelName = `vapi:session:${sessionId}`;
    }

    console.log('[VAPI Function Call] Broadcasting with session isolation:', { functionName, channelName, sessionId, params });

    const functionCallMessage = {
      functionName,
      params, // IMPORTANT: "params" to match client dispatcher
      callId,
      sessionId,
      assistantId: assistantId || undefined,
      timestamp: new Date().toISOString(),
      // Add debugging info
      debug: {
        originalSessionId: params?.sessionId,
        wasVariableSubstituted: params?.sessionId !== '{{sessionId}}',
        usedFallback: sessionId.startsWith('call_'),
        channelName
      }
    };

    // Broadcast to both session-specific AND generic channels for maximum compatibility
    const channels = [
      channelName, // Session-specific channel
      'vapi_function_calls' // Generic fallback channel
    ];

    const broadcastPromises = channels.map(async (ch) => {
      const channel = supabase.channel(ch);
      return channel.send({
        type: 'broadcast',
        event: 'function_call',
        payload: functionCallMessage
      } as any);
    });

    const results = await Promise.all(broadcastPromises);
    const sendResult = results.find(r => r === 'error') || 'ok';

    if (sendResult === 'error') {
      console.error('[VAPI Function Call] Broadcast error:', sendResult);
      return new Response(JSON.stringify({ error: 'Broadcast failed', details: sendResult }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[VAPI Function Call] Function call broadcasted with session isolation:', { functionName, channelName, sessionId });

    return new Response(
      JSON.stringify({ ok: true, status: 'broadcasted', channel: channelName, functionName, callId, sessionId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('[VAPI Function Call] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error)?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});