import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Supabase credentials for the client-side realtime (safe to expose anon key)
const supabaseUrl = 'https://mdkcdjltvfpthqudhhmx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NDU3NTAsImV4cCI6MjA2OTUyMTc1MH0.YJAf_8-6tKTXp00h7liGNLvYC_-vJ4ttonAxP3ySvOg';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const uuid = url.searchParams.get('uuid');
    const language = url.searchParams.get('language') || 'en';
    const position = url.searchParams.get('position') || 'bottom-right';
    const theme = url.searchParams.get('theme') || 'light';
    const apiKey = url.searchParams.get('apiKey');

    if (!uuid) {
      return new Response('Missing UUID parameter', { status: 400 });
    }

    if (!apiKey) {
      return new Response('Missing API key', { status: 400 });
    }

    console.log('[Voice Assistant Embed] Loading for UUID:', uuid);
    console.log('[Voice Assistant Embed] Using API Key:', apiKey ? 'SET' : 'MISSING');

    // Generate the complete voice assistant functionality
    const jsContent = `// Complete Voice Assistant Implementation
(function() {
  'use strict';
  
  console.log('🎤 Voice Assistant Full Implementation Loading...');

  // Configuration passed from lightweight embed
  const config = {
    uuid: '${uuid}',
    language: '${language}',
    position: '${position}',
    theme: '${theme}',
    apiKey: '${apiKey}',
    supabaseUrl: '${supabaseUrl}',
    supabaseKey: '${supabaseAnonKey}'
  };

  class VoiceAssistantManager {
    constructor() {
      this.vapiWidget = null;
      this.isInitialized = false;
      this.statusEl = null;
      this.userId = config.uuid;
      
      this.init();
    }

    init() {
      console.log('🎤 Initializing Complete Voice Assistant...');
      this.createStatusIndicator();
      this.updateStatus("Loading voice assistant...");
      this.loadVapiSDK();
      this.loadDOMBundle();
    }

    createStatusIndicator() {
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
        cursor: pointer;
      \`;
      
      statusEl.innerHTML = \`
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span id="voice-status-text">Initializing...</span>
          <span style="margin-left: 10px; cursor: pointer; opacity: 0.7;" onclick="this.parentElement.parentElement.style.display='none'">✕</span>
        </div>
      \`;
      
      document.body.appendChild(statusEl);
      this.statusEl = document.getElementById('voice-status-text');
    }

    loadVapiSDK() {
      if (window.vapiSDK) {
        this.initializeVapi();
        return;
      }

      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js";
      script.async = true;

      script.onload = () => {
        this.initializeVapi();
      };

      script.onerror = () => {
        console.warn('Primary VAPI SDK failed to load, trying npm CDN...');
        const fallback = document.createElement('script');
        fallback.src = "https://unpkg.com/@vapi-ai/web@latest/dist/index.umd.js";
        fallback.async = true;
        fallback.onload = () => this.initializeVapi();
        fallback.onerror = () => this.updateStatus("❌ Voice SDK failed to load");
        document.head.appendChild(fallback);
      };

      document.head.appendChild(script);
    }

    loadDOMBundle() {
      const script = document.createElement('script');
      script.src = 'https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/voice-dom-bundle';
      script.async = true;

      script.onload = () => {
        console.log('✅ DOM bundle loaded successfully');
        if (typeof window.initVoiceNavigator === 'function') {
          const navigatorConfig = {
            ...config,
            userId: config.uuid
          };
          window.initVoiceNavigator(navigatorConfig);
        }
      };

      script.onerror = () => {
        console.error('❌ Failed to load DOM manipulation bundle');
        this.updateStatus("⚠️ DOM features unavailable");
      };

      document.head.appendChild(script);
    }

    initializeVapi() {
      try {
        console.log('[VAPI] Initializing with config:', {
          apiKey: config.apiKey ? 'SET (' + config.apiKey.length + ' chars)' : 'MISSING',
          assistant: config.uuid,
          position: config.position,
          theme: config.theme
        });

        this.vapiWidget = window.vapiSDK.run({
          apiKey: config.apiKey,
          assistant: config.uuid,
          config: {
            position: config.position,
            theme: config.theme,
            mode: "voice"
          }
        });

        this.setupVapiEventListeners();
        this.isInitialized = true;
        this.updateStatus("🎤 Click the voice button to start!");
        
      } catch (error) {
        console.error('❌ Vapi initialization error:', error);
        this.updateStatus("❌ Voice setup failed");
      }
    }

    setupVapiEventListeners() {
      this.vapiWidget.on("call-start", () => {
        console.log('📞 Call started');
        this.updateStatus("🎤 Voice active - say your command!");
      });

      this.vapiWidget.on("call-end", () => {
        console.log('📞 Call ended');
        this.updateStatus("🔄 Voice ended");
      });

      this.vapiWidget.on("speech-start", () => {
        console.log('🤖 Assistant started speaking');
        this.updateStatus("🤖 Assistant responding...");
      });

      this.vapiWidget.on("speech-end", () => {
        console.log('🤖 Assistant finished speaking');
        this.updateStatus("🎤 Ready for your command");
      });

      this.vapiWidget.on("error", (error) => {
        console.error('❌ Vapi error:', error);
        console.error('❌ Vapi error details:', JSON.stringify(error, null, 2));
        
        // Try to extract more detailed error info
        if (error.error && error.error.json) {
          error.error.json().then(details => {
            console.error('❌ VAPI API Error Details:', details);
          }).catch(() => {
            console.error('❌ Could not parse VAPI error response');
          });
        }
        
        this.updateStatus("❌ Voice error: " + (error.message || error.type || 'Unknown'));
      });

      // Handle function calls and messages for DOM manipulation
      this.vapiWidget.on("message", (message) => {
        console.log('📨 VAPI Message received:', message);
        
        // Forward to DOM navigation if available
        if (window.handleVoiceCommand && typeof window.handleVoiceCommand === 'function') {
          window.handleVoiceCommand(message);
        }
      });
    }

    updateStatus(message) {
      if (this.statusEl) {
        this.statusEl.textContent = message;
      }
      console.log('🎤 Status:', message);
    }
  }

  // Store globally for access
  window.VoiceAssistantManager = VoiceAssistantManager;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new VoiceAssistantManager();
    });
  } else {
    new VoiceAssistantManager();
  }

  console.log('✅ Voice Assistant Full Implementation Loaded');

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
    console.error('[Voice Assistant Embed] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});