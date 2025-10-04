import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = 'https://mdkcdjltvfpthqudhhmx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NDU3NTAsImV4cCI6MjA2OTUyMTc1MH0.YJAf_8-6tKTXp00h7liGNLvYC_-vJ4ttonAxP3ySvOg';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mzk0NTc1MCwiZXhwIjoyMDY5NTIxNzUwfQ.TkAnuZIKeHJ5vZBXtNtU0A3CS1nhFNm7gCz00ch0Lfw';

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
    console.log('Parsed token payload in get-assistants:', payload);
    
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
  console.log('=== GET ASSISTANTS FUNCTION CALLED ===');
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
      return new Response(JSON.stringify({ error: 'No valid authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Extract token from Bearer header
    const token = authHeader.replace('Bearer ', '');
    console.log('Token extracted, length:', token.length);
    
    // Parse Clerk token to get user ID
    const userId = parseClerkToken(token);
    if (!userId) {
      console.error('Failed to parse user ID from token');
      return new Response(JSON.stringify({ error: 'Invalid user token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Fetching assistants for user:', userId);

    // Fetch assistants for the user with embed_id from embed_mappings
    const { data: assistants, error } = await supabase
      .from('assistants')
      .select(`
        *,
        embed_mappings!inner(embed_id)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      throw new Error(`Failed to fetch assistants: ${error.message}`);
    }

    console.log(`Found ${assistants?.length || 0} assistants for user`);

    // Transform the data to flatten embed_id
    const transformedAssistants = assistants?.map(assistant => ({
      ...assistant,
      embed_id: assistant.embed_mappings?.[0]?.embed_id || null,
      embed_mappings: undefined // Remove the nested object
    })) || [];

    return new Response(
      JSON.stringify({
        success: true,
        assistants: transformedAssistants
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error fetching assistants:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to fetch assistants',
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});