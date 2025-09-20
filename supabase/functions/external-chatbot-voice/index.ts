import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Supabase credentials for the client-side realtime (safe to expose anon key)
const supabaseUrl = 'https://mdkcdjltvfpthqudhhmx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NDU3NTAsImV4cCI6MjA2OTUyMTc1MH0.YJAf_8-6tKTXp00h7liGNLvYC_-vJ4ttonAxP3ySvOg';

// Get VAPI public key from environment
const vapiPublicKey = Deno.env.get('VAPI_PUBLIC_KEY') || Deno.env.get('VITE_VAPI_PUBLIC_KEY');

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[External Chatbot Voice] Generating lightweight embed script');
    console.log('[External Chatbot Voice] VAPI Public Key available:', !!vapiPublicKey);
    
    if (!vapiPublicKey) {
      console.error('[External Chatbot Voice] VAPI_PUBLIC_KEY not found in environment');
      return new Response('VAPI API key not configured', { status: 500 });
    }
    
    // Generate MINIMAL embed script that just bootstraps from backend
    const jsContent = `// Lightweight Voice Assistant Embed - Auto-detects config and bootstraps from backend
(function() {
  'use strict';
  
  // Auto-detect config from current script tag
  const scripts = document.getElementsByTagName('script');
  let config = null;
  
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    if (script.src && script.src.includes('external-chatbot-voice')) {
      config = {
        uuid: script.getAttribute('data-chatbot-uuid') || script.dataset.chatbotUuid,
        language: script.getAttribute('data-language') || script.dataset.language || 'en',
        position: script.getAttribute('data-position') || script.dataset.position || 'bottom-right',
        theme: script.getAttribute('data-theme') || script.dataset.theme || 'light'
      };
      break;
    }
  }
  
  if (!config || !config.uuid) {
    console.error('Voice Assistant: Missing data-chatbot-uuid attribute');
    return;
  }
  
  // Load the real functionality from backend
  const mainScript = document.createElement('script');
  mainScript.src = 'https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/voice-assistant-embed?' + 
    new URLSearchParams({
      uuid: config.uuid,
      language: config.language,
      position: config.position,
      theme: config.theme,
      apiKey: '${vapiPublicKey}'
    }).toString();
  mainScript.async = true;
  document.head.appendChild(mainScript);
  
})();
`;

    return new Response(jsContent, {
      status: 200,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      },
    });

  } catch (error) {
    console.error('[External Chatbot Voice] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});