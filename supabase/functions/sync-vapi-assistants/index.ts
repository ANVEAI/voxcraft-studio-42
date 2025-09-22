import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function parseClerkToken(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT format');
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.sub) throw new Error('No user ID in token');
    return payload.sub as string;
  } catch (err) {
    console.error('Error parsing Clerk token:', err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing or invalid authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const userId = parseClerkToken(token);
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid user token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://mdkcdjltvfpthqudhhmx.supabase.co';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SERVICE_KEY) throw new Error('Service role key not configured');
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const VAPI_PRIVATE_KEY = Deno.env.get('VAPI_PRIVATE_KEY');
    if (!VAPI_PRIVATE_KEY) throw new Error('VAPI_PRIVATE_KEY not configured');

    // Fetch assistants from VAPI
    const listRes = await fetch('https://api.vapi.ai/assistant', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${VAPI_PRIVATE_KEY}` }
    });

    if (!listRes.ok) {
      const text = await listRes.text();
      throw new Error(`VAPI list error: ${listRes.status} - ${text}`);
    }

    const vapiAssistants = await listRes.json();
    const assistantsArray = Array.isArray(vapiAssistants) ? vapiAssistants : vapiAssistants.items || [];

    // Get existing assistant IDs from DB
    const { data: existing, error: existingErr } = await supabase
      .from('assistants')
      .select('vapi_assistant_id');

    if (existingErr) throw existingErr;

    const existingIds = new Set((existing || []).map((a: any) => a.vapi_assistant_id));

    // Build rows to insert for those not present
    const rowsToInsert = assistantsArray
      .filter((a: any) => a?.id && !existingIds.has(a.id))
      .map((a: any) => ({
        user_id: userId,
        vapi_assistant_id: a.id,
        name: a.name || 'Voice Assistant',
        welcome_message: a.firstMessage || 'Hello! How can I help you today?',
        system_prompt: (a.model?.messages?.find((m: any) => m.role === 'system')?.content) || 'You are a helpful voice assistant.',
        language: 'en',
        voice_id: (a.voice?.voiceId) || 'vapi-elliot',
        position: 'right',
        theme: 'light',
        status: 'active'
      }));

    let insertedCount = 0;
    if (rowsToInsert.length > 0) {
      const { data: inserted, error: insertErr } = await supabase
        .from('assistants')
        .insert(rowsToInsert)
        .select('id');
      if (insertErr) throw insertErr;
      insertedCount = inserted?.length || 0;
    }

    return new Response(JSON.stringify({ success: true, imported: insertedCount, scanned: assistantsArray.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('sync-vapi-assistants error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});