import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://mdkcdjltvfpthqudhhmx.supabase.co';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseServiceKey) {
  console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY is not set. Using anon key will likely fail with RLS.');
}

// Use service role to bypass RLS inside trusted Edge Function
const supabase = createClient(supabaseUrl, supabaseServiceKey ?? (Deno.env.get('SUPABASE_ANON_KEY') || ''));

// Parse Clerk JWT to extract user id (sub)
function parseClerkToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    console.log('Parsed token payload in save-assistant:', payload);
    return payload.sub || null;
  } catch (e) {
    console.error('Failed to parse Clerk token:', e);
    return null;
  }
}

serve(async (req) => {
  console.log('=== SAVE ASSISTANT FUNCTION CALLED ===');
  console.log('Method:', req.method);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Manual auth using Clerk token from Authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Missing/invalid Authorization header');
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('Authorization token length:', token.length);

    const userId = parseClerkToken(token);
    if (!userId) {
      console.error('Could not extract user id from token');
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const assistantData = await req.json();
    console.log('Saving assistant for user:', userId, 'payload keys:', Object.keys(assistantData || {}));

    const { data: assistantRecord, error: dbError } = await supabase
      .from('assistants')
      .insert({
        user_id: userId,
        vapi_assistant_id: assistantData.vapi_assistant_id ?? null,
        name: assistantData.name,
        welcome_message: assistantData.welcome_message,
        system_prompt: assistantData.system_prompt,
        language: assistantData.language,
        voice_id: assistantData.voice_id,
        position: assistantData.position,
        theme: assistantData.theme,
        status: assistantData.status ?? 'active',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Failed to save assistant: ${dbError.message}`);
    }

    console.log('Assistant saved successfully:', assistantRecord?.id);

    return new Response(
      JSON.stringify({ success: true, assistant: assistantRecord }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error saving assistant:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'Failed to save assistant' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});