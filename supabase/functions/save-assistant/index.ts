import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://mdkcdjltvfpthqudhhmx.supabase.co';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NDU3NTAsImV4cCI6MjA2OTUyMTc1MH0.YJAf_8-6tKTXp00h7liGNLvYC_-vJ4ttonAxP3ySvOg';

// Initialize Supabase client with anon key to use RLS policies
const supabase = createClient(supabaseUrl, supabaseAnonKey);

serve(async (req) => {
  console.log('=== SAVE ASSISTANT FUNCTION CALLED ===');
  console.log('Method:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authenticated user from Supabase's JWT verification
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Authentication error:', authError);
      throw new Error('Authentication required');
    }

    console.log('Authenticated user:', user.id);

    const assistantData = await req.json();
    console.log('Saving assistant:', assistantData.name, 'for user:', user.id);

    // Insert the assistant data into Supabase with the authenticated user ID
    const { data: assistantRecord, error: dbError } = await supabase
      .from('assistants')
      .insert({
        user_id: user.id,  // Use the authenticated user ID from Supabase
        vapi_assistant_id: assistantData.vapi_assistant_id,
        name: assistantData.name,
        welcome_message: assistantData.welcome_message,
        system_prompt: assistantData.system_prompt,
        language: assistantData.language,
        voice_id: assistantData.voice_id,
        position: assistantData.position,
        theme: assistantData.theme,
        status: assistantData.status
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Failed to save assistant: ${dbError.message}`);
    }

    console.log('Assistant saved successfully:', assistantRecord);

    return new Response(
      JSON.stringify({
        success: true,
        assistant: assistantRecord
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error saving assistant:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to save assistant',
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});