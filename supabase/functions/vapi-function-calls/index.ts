import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-vapi-assistant-id, x-assistant-id, x-assistant',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Module-level in-memory session mapping cache (callId -> sessionId)
// This persists across requests in the same edge function instance
const sessionMappings = new Map<string, string>();
const activeListeners = new Map<string, any>();

// Module-level initialization: Set up persistent session mapping listeners
async function initializeSessionListener(assistantId: string) {
  // Don't create duplicate listeners
  if (activeListeners.has(assistantId)) {
    console.log('[Session Mapping] Listener already active for assistant:', assistantId);
    return activeListeners.get(assistantId);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[Session Mapping] Cannot initialize - missing Supabase credentials');
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const mappingChannel = `vapi:session-mapping:${assistantId}`;
  
  console.log('[Session Mapping] Initializing persistent listener for:', assistantId);
  
  const channel = supabase.channel(mappingChannel);
  
  channel
    .on('broadcast', { event: 'register_session' }, (payload: any) => {
      const { callId, sessionId } = payload.payload;
      if (callId && sessionId) {
        sessionMappings.set(callId, sessionId);
        console.log('[Session Mapping] ✅ Registered:', { 
          callId, 
          sessionId: sessionId.substr(0, 8) + '...',
          totalMappings: sessionMappings.size 
        });
      }
    })
    .subscribe((status: string) => {
      console.log('[Session Mapping] Channel status for', assistantId + ':', status);
    });
  
  activeListeners.set(assistantId, channel);
  return channel;
}

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

    // Extract assistant ID and ensure persistent listener is initialized
    const assistantId = payload?.message?.assistant?.id || payload?.assistant?.id;
    if (assistantId) {
      // Initialize persistent listener (will skip if already active)
      await initializeSessionListener(assistantId);
    } else {
      console.warn('[VAPI Function Call] No assistant ID found, session mapping may not work');
    }

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

    // VAPI-Native Session Isolation: Use call ID + session ID for unique channels
    if (!vapiCallId) {
      console.error('[VAPI Function Call] Missing VAPI call ID for session isolation');
      return new Response(JSON.stringify({ error: 'Missing VAPI call ID for session isolation' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Wait for session mapping with timeout (handles race condition)
    const waitForMapping = async (callId: string, timeoutMs = 1500): Promise<string | null> => {
      const startTime = Date.now();
      const checkInterval = 100; // Check every 100ms
      
      while (Date.now() - startTime < timeoutMs) {
        const sessionId = sessionMappings.get(callId);
        if (sessionId) {
          console.log('[VAPI Function Call] ✅ Session mapping found:', {
            callId,
            sessionId: sessionId.substr(0, 8) + '...',
            waitedMs: Date.now() - startTime
          });
          return sessionId;
        }
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
      
      console.warn('[VAPI Function Call] ⏰ Session mapping timeout after', timeoutMs, 'ms for callId:', callId);
      return null;
    };
    
    // Look up session ID for this call (with wait)
    let sessionId = sessionMappings.get(vapiCallId);
    
    if (!sessionId) {
      console.log('[VAPI Function Call] 🔍 Waiting for session mapping...', vapiCallId);
      sessionId = await waitForMapping(vapiCallId, 1500);
    }
    
    if (!sessionId) {
      console.warn('[VAPI Function Call] ⚠️ No session mapping found after wait for callId:', vapiCallId);
      console.warn('[VAPI Function Call] Available mappings:', Array.from(sessionMappings.entries()).map(([k, v]) => [k, v.substr(0, 8) + '...']));
      console.warn('[VAPI Function Call] Total mappings:', sessionMappings.size);
      console.warn('[VAPI Function Call] Active listeners:', Array.from(activeListeners.keys()));
      
      // Fallback: broadcast to all sessions for this call (backwards compatibility)
      const channelName = `vapi:call:${vapiCallId}`;
      console.log('[VAPI Function Call] ⚠️ Using fallback broadcast to all sessions:', { functionName, channelName, vapiCallId, params });
      
      const functionCallMessage = {
        functionName,
        params,
        callId,
        vapiCallId,
        timestamp: new Date().toISOString()
      };

      const channel = supabase.channel(channelName);
      await channel.send({
        type: 'broadcast',
        event: 'function_call',
        payload: functionCallMessage
      } as any);

      return new Response(
        JSON.stringify({ ok: true, status: 'broadcasted_no_session', channel: channelName, functionName, callId, vapiCallId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Include session ID for true per-user isolation
    const channelName = `vapi:call:${vapiCallId}:${sessionId}`;
    console.log('[VAPI Function Call] Broadcasting to session-specific channel:', { 
      functionName, 
      channelName, 
      vapiCallId, 
      sessionId: sessionId.substr(0, 8) + '...', 
      params 
    });

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

    console.log('[VAPI Function Call] Function call broadcasted to isolated session:', { 
      functionName, 
      channelName, 
      vapiCallId, 
      sessionId: sessionId.substr(0, 8) + '...' 
    });

    // Clean up old session mappings (older than 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    for (const [callId, _sessionId] of sessionMappings.entries()) {
      // Simple cleanup - remove if call is likely old (this is approximate)
      if (sessionMappings.size > 100) { // Only cleanup if we have many mappings
        sessionMappings.delete(callId);
        break; // Remove one at a time
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        status: 'broadcasted', 
        channel: channelName, 
        functionName, 
        callId, 
        vapiCallId,
        sessionId: sessionId.substr(0, 8) + '...',
        isolated: true
      }),
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