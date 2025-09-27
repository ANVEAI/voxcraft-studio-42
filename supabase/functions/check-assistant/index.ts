import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🚀 Function started - check-assistant');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('📋 CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📨 Parsing request body...');
    const body = await req.json();
    console.log('✅ Request body parsed:', JSON.stringify(body));
    
    const { assistantId } = body;
    
    if (!assistantId) {
      console.log('❌ No assistantId provided');
      throw new Error('Assistant ID is required');
    }

    const VAPI_PRIVATE_KEY = Deno.env.get('VAPI_PRIVATE_KEY');
    console.log('🔑 VAPI_PRIVATE_KEY check:', {
      exists: !!VAPI_PRIVATE_KEY,
      length: VAPI_PRIVATE_KEY?.length,
      preview: VAPI_PRIVATE_KEY ? `${VAPI_PRIVATE_KEY.substring(0, 8)}...${VAPI_PRIVATE_KEY.slice(-4)}` : 'null'
    });
    
    if (!VAPI_PRIVATE_KEY) {
      console.log('❌ VAPI_PRIVATE_KEY not configured');
      throw new Error('VAPI_PRIVATE_KEY not configured');
    }

    // Extract key info for verification
    const keyInfo = {
      privateKeyPrefix: `${VAPI_PRIVATE_KEY.substring(0, 8)}...${VAPI_PRIVATE_KEY.slice(-4)}`
    };

    console.log('🔍 Checking VAPI assistant:', assistantId);

    // For connection testing, just return the key info without calling VAPI
    if (assistantId === 'test-connection') {
      console.log('🧪 Connection test mode');
      const testResponse = {
        assistantId,
        exists: false,
        status: 200,
        statusText: 'Connection Test',
        keyInfo,
        connectionTest: true,
        timestamp: new Date().toISOString()
      };
      console.log('✅ Returning test response:', testResponse);
      return new Response(JSON.stringify(testResponse), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Check if the assistant exists in VAPI
    console.log('📡 Making VAPI API call...');
    const response = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('📡 VAPI API response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    const result: {
      assistantId: any;
      exists: boolean;
      status: number;
      statusText: string;
      keyInfo: { privateKeyPrefix: string; };
      name?: string;
      voice?: string;
      model?: string;
      error?: string;
    } = {
      assistantId,
      exists: response.ok,
      status: response.status,
      statusText: response.statusText,
      keyInfo
    };

    if (response.ok) {
      const assistantData = await response.json();
      result.name = assistantData.name;
      result.voice = assistantData.voice;
      result.model = assistantData.model;
      console.log('✅ Assistant found:', result);
    } else {
      const errorText = await response.text();
      result.error = errorText;
      console.log('❌ Assistant check failed:', result);
    }

    console.log('📤 Sending response:', result);
    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

  } catch (error: any) {
    console.error('💥 Error in check-assistant:', error);
    console.error('💥 Error stack:', error?.stack);
    
    const VAPI_PRIVATE_KEY = Deno.env.get('VAPI_PRIVATE_KEY');
    const errorResponse = { 
      error: error?.message || 'Unknown error',
      exists: false,
      keyInfo: {
        privateKeyPrefix: VAPI_PRIVATE_KEY ? 
          `${VAPI_PRIVATE_KEY.substring(0, 8)}...${VAPI_PRIVATE_KEY.slice(-4)}` : 
          'Not configured'
      }
    };
    
    console.log('📤 Sending error response:', errorResponse);
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});