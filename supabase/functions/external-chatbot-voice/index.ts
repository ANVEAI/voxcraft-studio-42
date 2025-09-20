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
    console.log('[External Chatbot Voice] Request received');
    console.log('[External Chatbot Voice] VAPI Public Key available:', !!vapiPublicKey);
    console.log('[External Chatbot Voice] VAPI Public Key value:', vapiPublicKey || 'NOT_SET');
    
    if (!vapiPublicKey) {
      console.error('[External Chatbot Voice] VAPI_PUBLIC_KEY not found in environment');
      return new Response('VAPI API key not configured', { status: 500 });
    }
    
    // Generate lightweight embed script that auto-detects its own attributes
    const jsContent = `// Lightweight Voice Assistant Embed Script
// Auto-detects configuration from script tag attributes
(function() {
  'use strict';
  
  console.log('🎤 Voice Assistant Embed Loading...');

  // Auto-detect configuration from current script tag
  function getConfiguration() {
    const scripts = document.getElementsByTagName('script');
    let config = {};
    
    // Find our script tag by checking src for external-chatbot-voice
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      if (script.src && script.src.includes('external-chatbot-voice')) {
        config = {
          chatbotUuid: script.getAttribute('data-chatbot-uuid') || script.dataset.chatbotUuid,
          language: script.getAttribute('data-language') || script.dataset.language || 'en',
          position: script.getAttribute('data-position') || script.dataset.position || 'bottom-right',
          theme: script.getAttribute('data-theme') || script.dataset.theme || 'light'
        };
        console.log('🔍 Auto-detected config from script tag:', config);
        break;
      }
    }
    
    if (!config.chatbotUuid) {
      console.error('❌ Missing data-chatbot-uuid attribute on script tag');
      return null;
    }
    
    return config;
  }

  // Load the main voice assistant functionality from backend
  function loadVoiceAssistant(config) {
    console.log('📡 Loading voice assistant from backend...');
    
    // Create status indicator
    const statusEl = document.createElement('div');
    statusEl.id = 'voice-assistant-status';
    statusEl.style.cssText = \`
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      z-index: 10000;
      max-width: 300px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
    \`;
    statusEl.innerHTML = \`
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span id="voice-status-text">Loading voice assistant...</span>
        <span style="margin-left: 10px; cursor: pointer; opacity: 0.7;" onclick="this.parentElement.parentElement.style.display='none'">✕</span>
      </div>
    \`;
    document.body.appendChild(statusEl);

    // Load VAPI SDK
    const vapiScript = document.createElement('script');
    vapiScript.src = "https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js";
    vapiScript.async = true;
    
    vapiScript.onload = () => {
      console.log('✅ VAPI SDK loaded');
      initializeVoiceWidget(config);
    };
    
    vapiScript.onerror = () => {
      console.error('❌ Failed to load VAPI SDK');
      document.getElementById('voice-status-text').textContent = '❌ Voice SDK failed to load';
    };
    
    document.head.appendChild(vapiScript);

    // Load DOM manipulation bundle
    const domScript = document.createElement('script');
    domScript.src = 'https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/voice-dom-bundle';
    domScript.async = true;
    
    domScript.onload = () => {
      console.log('✅ DOM bundle loaded');
      if (typeof window.initVoiceNavigator === 'function') {
        const navigatorConfig = {
          ...config,
          supabaseUrl: '${supabaseUrl}',
          supabaseKey: '${supabaseAnonKey}',
          userId: config.chatbotUuid
        };
        window.initVoiceNavigator(navigatorConfig);
      }
    };
    
    domScript.onerror = () => {
      console.error('❌ Failed to load DOM bundle');
    };
    
    document.head.appendChild(domScript);
  }

  // Initialize VAPI widget with backend-provided API key
  function initializeVoiceWidget(config) {
    try {
      console.log('🎤 Initializing VAPI widget...');
      
      const vapiWidget = window.vapiSDK.run({
        apiKey: '${vapiPublicKey}', // API key securely injected from backend
        assistant: config.chatbotUuid,
        config: {
          position: config.position,
          theme: config.theme,
          mode: "voice"
        }
      });

      // Set up event listeners
      vapiWidget.on("call-start", () => {
        console.log('📞 Voice call started');
        document.getElementById('voice-status-text').textContent = '🎤 Voice active - say your command!';
      });

      vapiWidget.on("call-end", () => {
        console.log('📞 Voice call ended');
        document.getElementById('voice-status-text').textContent = '🔄 Voice ended';
      });

      vapiWidget.on("speech-start", () => {
        document.getElementById('voice-status-text').textContent = '🤖 Assistant responding...';
      });

      vapiWidget.on("speech-end", () => {
        document.getElementById('voice-status-text').textContent = '🎤 Ready for your command';
      });

      vapiWidget.on("error", (error) => {
        console.error('❌ VAPI error:', error);
        document.getElementById('voice-status-text').textContent = '❌ Voice error';
      });

      // Store globally for debugging
      window.vapiWidget = vapiWidget;
      
      document.getElementById('voice-status-text').textContent = '🎤 Click the voice button to start!';
      console.log('✅ Voice assistant ready!');
      
    } catch (error) {
      console.error('❌ VAPI initialization failed:', error);
      document.getElementById('voice-status-text').textContent = '❌ Voice setup failed';
    }
  }

  // Auto-initialize when DOM is ready
  function initialize() {
    const config = getConfiguration();
    if (config) {
      loadVoiceAssistant(config);
    } else {
      console.error('❌ Could not detect configuration from script tag');
    }
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

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