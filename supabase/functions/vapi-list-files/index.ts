import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log(`${req.method} /vapi-list-files`);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Extract the Clerk JWT token and get user ID (same method as vapi-analytics)
    const jwt = authHeader.replace('Bearer ', '');
    
    let userId;
    try {
      const base64Url = jwt.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      userId = payload.sub;
      console.log('📝 Extracted user ID from JWT payload:', userId);
    } catch (decodeError) {
      console.error('Failed to decode JWT:', decodeError);
      return new Response(JSON.stringify({ error: 'Invalid authentication token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'No user ID found in token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('📝 Fetching files for user:', userId);

    // Get VAPI private key
    const vapiPrivateKey = Deno.env.get('VAPI_PRIVATE_KEY');
    if (!vapiPrivateKey) {
      throw new Error('VAPI_PRIVATE_KEY not configured');
    }

    // Fetch files from VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/file', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vapiPrivateKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!vapiResponse.ok) {
      const errorText = await vapiResponse.text();
      console.error('VAPI list files error:', errorText);
      throw new Error(`Failed to fetch files from VAPI: ${vapiResponse.status} ${errorText}`);
    }

    const vapiFiles = await vapiResponse.json();
    console.log('📁 Retrieved files from VAPI:', vapiFiles.length || 0);

    // Process files to get recent ones with details
    const processedFiles = (vapiFiles || []).slice(0, 3).map((file: any) => ({
      id: file.id,
      name: file.name || 'Unknown',
      originalName: file.originalName || file.name,
      status: file.status || 'unknown',
      bytes: file.bytes || 0,
      createdAt: file.createdAt,
      url: file.url,
      parsedTextUrl: file.parsedTextUrl
    }));

    return new Response(
      JSON.stringify({
        success: true,
        files: vapiFiles || [],
        recentFiles: processedFiles,
        count: vapiFiles?.length || 0,
        lastUpdated: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in vapi-list-files function:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        success: false
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});