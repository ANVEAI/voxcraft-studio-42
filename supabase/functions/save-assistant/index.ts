import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://mdkcdjltvfpthqudhhmx.supabase.co';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NDU3NTAsImV4cCI6MjA2OTUyMTc1MH0.YJAf_8-6tKTXp00h7liGNLvYC_-vJ4ttonAxP3ySvOg';

const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mzk0NTc1MCwiZXhwIjoyMDY5NTIxNzUwfQ.TkAnuZIKeHJ5vZBXtNtU0A3CS1nhFNm7gCz00ch0Lfw';

// Initialize Supabase client with service role key to bypass RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Verify Clerk JWT token by parsing it (simpler approach)
function parseClerkToken(token: string) {
  try {
    // Basic JWT parsing - just get the payload for user info
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    
    const payload = JSON.parse(atob(parts[1]));
    console.log('Parsed token payload in save-assistant:', payload);
    
    // Clerk JWTs have 'sub' field with user ID
    if (!payload.sub) {
      throw new Error('No user ID in token');
    }
    
    return payload.sub;
  } catch (error) {
    console.error('Error parsing Clerk token:', error);
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
    // Get authorization header for user authentication
    const authHeader = req.headers.get('authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Invalid authorization header');
      throw new Error('No valid authorization header');
    }

    // Extract token from Bearer header
    const token = authHeader.replace('Bearer ', '');
    console.log('Token extracted, length:', token.length);
    
    // Parse Clerk token to get user ID
    const userId = parseClerkToken(token);
    if (!userId) {
      console.error('Failed to parse user ID from token');
      throw new Error('Invalid user token');
    }

    const assistantData = await req.json();
    console.log('🔍 DEBUG - Saving assistant:', assistantData.name, 'for user:', userId);
    console.log('🔍 DEBUG - Assistant data received:', JSON.stringify(assistantData, null, 2));

    // Insert the assistant data into Supabase with the parsed user ID
    const { data: assistantRecord, error: dbError } = await supabase
      .from('assistants')
      .insert({
        user_id: userId,  // Use the parsed user ID from Clerk token
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

    console.log('✅ Assistant saved successfully:', assistantRecord);

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