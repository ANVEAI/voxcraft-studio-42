import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface VapiWebhookPayload {
  type: string;
  call?: {
    id: string;
    orgId: string;
    createdAt: string;
    updatedAt: string;
    type: string;
    status: string;
    startedAt?: string;
    endedAt?: string;
    endedReason?: string;
    phoneNumber?: string;
    recordingUrl?: string;
    transcript?: any;
    messages?: any[];
    costs?: any[];
    analysis?: any;
    assistant?: {
      id: string;
    };
  };
  message?: {
    type: string;
    functionCall?: {
      name: string;
      parameters: any;
    };
    toolCalls?: Array<{
      function: {
        name: string;
        arguments: string | any;
      };
    }>;
  };
  assistant?: {
    id: string;
    customer_id?: string;
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
    console.log('[VAPI Webhook] Webhook received');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    const payload: VapiWebhookPayload = await req.json();
    console.log('[VAPI Webhook] Payload type:', payload.type);
    console.log('[VAPI Webhook] Full payload:', JSON.stringify(payload, null, 2));

    // Handle function calls first
    if (payload.message) {
      const assistantId = payload.assistant?.id || payload.call?.assistant?.id;
      if (assistantId) {
        const result = await handleFunctionCall(supabase, payload, assistantId);
        if (result) {
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // Handle regular call events
    if (!payload.call) {
      return new Response(JSON.stringify({ error: 'No call data in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const call = payload.call;

    // Find the user who owns this assistant
    const { data: assistant, error: assistantError } = await supabase
      .from('assistants')
      .select('id, user_id')
      .eq('vapi_assistant_id', call.assistant?.id)
      .single();

    if (assistantError || !assistant) {
      console.log('[VAPI Webhook] Assistant not found for VAPI ID:', call.assistant?.id);
      return new Response(JSON.stringify({ error: 'Assistant not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[VAPI Webhook] Found assistant for user:', assistant.user_id);

    // Handle different webhook types
    switch (payload.type) {
      case 'call-start':
        await handleCallStart(supabase, assistant, call);
        break;
      
      case 'call-end':
        await handleCallEnd(supabase, assistant, call);
        break;
      
      case 'call-update':
        await handleCallUpdate(supabase, assistant, call);
        break;
      
      default:
        console.log('[VAPI Webhook] Unknown webhook type:', payload.type);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VAPI Webhook] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function handleCallStart(supabase: any, assistant: any, call: any) {
  console.log('[VAPI Webhook] Handling call start for call:', call.id);

  const callData = {
    vapi_call_id: call.id,
    user_id: assistant.user_id,
    assistant_id: assistant.id,
    vapi_assistant_id: call.assistant?.id,
    call_type: call.type,
    status: call.status,
    started_at: call.startedAt ? new Date(call.startedAt).toISOString() : new Date().toISOString(),
    phone_number: call.phoneNumber,
    metadata: {
      orgId: call.orgId,
      createdAt: call.createdAt,
      updatedAt: call.updatedAt
    }
  };

  const { error } = await supabase
    .from('call_logs')
    .upsert(callData, { 
      onConflict: 'vapi_call_id',
      ignoreDuplicates: false 
    });

  if (error) {
    console.error('[VAPI Webhook] Error inserting call start:', error);
  } else {
    console.log('[VAPI Webhook] Call start recorded successfully');
  }
}

async function handleCallEnd(supabase: any, assistant: any, call: any) {
  console.log('[VAPI Webhook] Handling call end for call:', call.id);

  // Calculate duration
  const duration = call.endedAt && call.startedAt ? 
    Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000) : null;

  const callData = {
    vapi_call_id: call.id,
    user_id: assistant.user_id,
    assistant_id: assistant.id,
    vapi_assistant_id: call.assistant?.id,
    call_type: call.type,
    status: call.status,
    started_at: call.startedAt ? new Date(call.startedAt).toISOString() : null,
    ended_at: call.endedAt ? new Date(call.endedAt).toISOString() : new Date().toISOString(),
    duration_seconds: duration,
    ended_reason: call.endedReason,
    phone_number: call.phoneNumber,
    recording_url: call.recordingUrl,
    transcript: call.transcript,
    messages: call.messages,
    costs: call.costs,
    analysis: call.analysis,
    metadata: {
      orgId: call.orgId,
      createdAt: call.createdAt,
      updatedAt: call.updatedAt
    }
  };

  const { error } = await supabase
    .from('call_logs')
    .upsert(callData, { 
      onConflict: 'vapi_call_id',
      ignoreDuplicates: false 
    });

  if (error) {
    console.error('[VAPI Webhook] Error updating call end:', error);
  } else {
    console.log('[VAPI Webhook] Call end recorded successfully');
    
    // Update daily analytics asynchronously
    updateDailyAnalytics(supabase, assistant.user_id).catch(error => {
      console.error('[VAPI Webhook] Background analytics update failed:', error);
    });
  }
}

async function handleCallUpdate(supabase: any, assistant: any, call: any) {
  console.log('[VAPI Webhook] Handling call update for call:', call.id);

  const { error } = await supabase
    .from('call_logs')
    .update({
      status: call.status,
      messages: call.messages,
      transcript: call.transcript,
      metadata: {
        orgId: call.orgId,
        createdAt: call.createdAt,
        updatedAt: call.updatedAt
      }
    })
    .eq('vapi_call_id', call.id)
    .eq('user_id', assistant.user_id);

  if (error) {
    console.error('[VAPI Webhook] Error updating call:', error);
  } else {
    console.log('[VAPI Webhook] Call update recorded successfully');
  }
}

async function handleFunctionCall(supabase: any, payload: VapiWebhookPayload, assistantId: string) {
  console.log('[VAPI Webhook] Processing function call for assistant:', assistantId);

  // Extract function call from VAPI payload
  let functionCall = null;
  if (payload.message?.functionCall) {
    functionCall = payload.message.functionCall;
  } else if (payload.message?.toolCalls?.length > 0) {
    const toolCall = payload.message.toolCalls[0];
    functionCall = {
      name: toolCall.function.name,
      parameters: typeof toolCall.function.arguments === 'string' 
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments
    };
  }

  if (!functionCall) {
    console.log('[VAPI Webhook] No function call found in message');
    return null;
  }

  console.log('[VAPI Webhook] Function call:', functionCall.name, functionCall.parameters);

  // Find the user who owns this assistant
  const { data: assistant, error: assistantError } = await supabase
    .from('assistants')
    .select('id, user_id')
    .eq('vapi_assistant_id', assistantId)
    .single();

  if (assistantError || !assistant) {
    console.log('[VAPI Webhook] Assistant not found for function call:', assistantId);
    return { error: 'Assistant not found' };
  }

  // Map function to command
  const command = mapFunctionToCommand(functionCall, assistant.user_id);
  
  if (!command) {
    console.log('[VAPI Webhook] Unknown function:', functionCall.name);
    return { error: `Unknown function: ${functionCall.name}` };
  }

  console.log('[VAPI Webhook] Broadcasting command:', command);

  // Broadcast to user-specific channel via Supabase Realtime
  try {
    const channel = supabase.channel(`voice-commands-${assistant.user_id}`);
    await channel.send({
      type: 'broadcast',
      event: 'voice_command',
      payload: command
    });

    console.log('[VAPI Webhook] Command broadcasted successfully');
    
    return { 
      result: `Executed ${command.action} command successfully`,
      command: command
    };
  } catch (error) {
    console.error('[VAPI Webhook] Error broadcasting command:', error);
    return { error: 'Failed to broadcast command' };
  }
}

function mapFunctionToCommand(functionCall: any, userId: string) {
  const { name, parameters } = functionCall;

  const baseCommand = {
    userId,
    timestamp: new Date().toISOString()
  };

  switch (name) {
    case 'scroll_page':
      return {
        ...baseCommand,
        action: 'scroll',
        direction: parameters.direction
      };
    case 'click_element':
      return {
        ...baseCommand,
        action: 'click',
        targetText: parameters.target_text
      };
    case 'fill_field':
      return {
        ...baseCommand,
        action: 'fill',
        value: parameters.value,
        fieldHint: parameters.field_hint || 'text'
      };
    case 'toggle_element':
      return {
        ...baseCommand,
        action: 'toggle',
        target: parameters.target
      };
    default:
      return null;
  }
}

async function updateDailyAnalytics(supabase: any, userId: string) {
  try {
    console.log('[VAPI Webhook] Updating daily analytics for user:', userId);
    
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's call data
    const { data: calls } = await supabase
      .from('call_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('started_at', `${today}T00:00:00.000Z`)
      .lt('started_at', `${today}T23:59:59.999Z`);

    if (!calls || calls.length === 0) return;

    // Calculate daily stats
    const totalCalls = calls.length;
    const successfulCalls = calls.filter(c => 
      c.status === 'ended' && 
      c.ended_reason !== 'assistant-error' && 
      c.ended_reason !== 'pipeline-error-voice-provider-playht-audio-too-short'
    ).length;
    const failedCalls = totalCalls - successfulCalls;
    
    const totalDuration = calls.reduce((sum, call) => sum + (call.duration_seconds || 0), 0);
    const totalCost = calls.reduce((sum, call) => {
      if (call.costs && Array.isArray(call.costs)) {
        return sum + call.costs.reduce((costSum, cost) => costSum + (cost.cost || 0), 0);
      }
      return sum;
    }, 0);

    const analyticsData = {
      user_id: userId,
      assistant_id: null, // Aggregate across all assistants
      date: today,
      total_calls: totalCalls,
      successful_calls: successfulCalls,
      failed_calls: failedCalls,
      total_duration_seconds: totalDuration,
      total_cost: totalCost,
      average_duration_seconds: totalCalls > 0 ? totalDuration / totalCalls : 0,
      success_rate: totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0
    };

    const { error } = await supabase
      .from('call_analytics')
      .upsert(analyticsData, { 
        onConflict: 'user_id,assistant_id,date',
        ignoreDuplicates: false 
      });

    if (error) {
      console.error('[VAPI Webhook] Error updating daily analytics:', error);
    } else {
      console.log('[VAPI Webhook] Daily analytics updated successfully');
    }

  } catch (error) {
    console.error('[VAPI Webhook] Error in updateDailyAnalytics:', error);
  }
}