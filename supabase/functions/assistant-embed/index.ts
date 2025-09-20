import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Log request for debugging
  console.log('[EMBED] Request received:', req.method, req.url);
  console.log('[EMBED] Origin:', req.headers.get('origin'));
  console.log('[EMBED] Referer:', req.headers.get('referer'));

  // Extract query parameters for configuration
  const url = new URL(req.url);
  const params = url.searchParams;

  const embedScript = `
(function() {
  'use strict';
  
  console.log('[VoiceAI] Loading assistant embed script...');

  // Auto-detect configuration from script tag or URL parameters
  function getConfiguration() {
    const scripts = document.getElementsByTagName('script');
    let config = {};
    let scriptSrc = '';
    
    // Find our script tag
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      if (script.src && script.src.includes('assistant-embed')) {
        scriptSrc = script.src;
        
        // Get config from data attributes
        config = {
          assistantId: script.getAttribute('data-assistant-id') || script.dataset.assistantId,
          vapiAssistantId: script.getAttribute('data-vapi-assistant-id') || script.dataset.vapiAssistantId,
          position: script.getAttribute('data-position') || script.dataset.position || 'right',
          theme: script.getAttribute('data-theme') || script.dataset.theme || 'light',
          language: script.getAttribute('data-language') || script.dataset.language || 'en'
        };
        break;
      }
    }
    
    // If no data attributes found, try URL parameters
    if (!config.assistantId && scriptSrc) {
      const url = new URL(scriptSrc);
      config = {
        assistantId: url.searchParams.get('assistantId') || url.searchParams.get('assistant_id'),
        vapiAssistantId: url.searchParams.get('vapiAssistantId') || url.searchParams.get('vapi_assistant_id'),
        position: url.searchParams.get('position') || 'right',
        theme: url.searchParams.get('theme') || 'light',
        language: url.searchParams.get('language') || 'en'
      };
    }
    
    console.log('[VoiceAI] Auto-detected config:', config);
    return config;
  }

  // Load advanced voice navigation engine from backend
  function loadAdvancedEngine(config) {
    return new Promise((resolve, reject) => {
      if (window.UniversalVoiceNavigator) {
        resolve(window.UniversalVoiceNavigator);
        return;
      }

      const script = document.createElement('script');
      const currentScript = document.currentScript || 
        Array.from(document.scripts).find(s => s.src.includes('assistant-embed'));
      const baseUrl = currentScript ? new URL(currentScript.src).origin : '';
      
      script.src = baseUrl + '/functions/v1/voice-navigation-engine';
      script.async = true;

      script.onload = () => {
        if (window.UniversalVoiceNavigator) {
          resolve(window.UniversalVoiceNavigator);
        } else {
          reject(new Error('Advanced engine failed to initialize'));
        }
      };

      script.onerror = () => reject(new Error('Failed to load advanced voice navigation engine'));
      document.head.appendChild(script);
    });
  }

  // Initialize the voice assistant with advanced features
  async function initializeVoiceAssistant(config) {
    if (!config.assistantId || !config.vapiAssistantId) {
      console.error('[VoiceAI] Missing required configuration. Please provide assistantId and vapiAssistantId');
      return false;
    }

    try {
      console.log('[VoiceAI] Loading advanced voice navigation features...');
      
      // Load the advanced engine from backend
      const VoiceNavigator = await loadAdvancedEngine(config);
      
      // Initialize the advanced voice navigator
      const navigator = new VoiceNavigator(config);
      
      // Create the voice button (the advanced engine handles all functionality)
      navigator.createVoiceButton();
      
      // Store reference globally for manual control
      window.voiceNavigator = navigator;
      
      console.log('[VoiceAI] Advanced voice assistant initialized successfully');
      return true;
      
    } catch (error) {
      console.error('[VoiceAI] Failed to initialize advanced features:', error);
      
      // Fallback to basic button if advanced features fail
      console.log('[VoiceAI] Falling back to basic voice button...');
      createBasicVoiceButton(config);
      return false;
    }
  }

  // Fallback basic voice button (minimal functionality)
  function createBasicVoiceButton(config) {
    if (document.getElementById('voice-assistant-btn')) return;
    
    const button = document.createElement('button');
    button.id = 'voice-assistant-btn';
    button.innerHTML = '🎤';
    button.style.cssText = \`
      position: fixed;
      \${config.position === 'left' ? 'left: 20px' : 'right: 20px'};
      bottom: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: none;
      background: \${config.theme === 'dark' ? '#1f2937' : '#3b82f6'};
      color: white;
      font-size: 24px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      transition: all 0.3s ease;
      pointer-events: auto;
    \`;
    
    button.onclick = () => {
      alert('Voice assistant is loading. Please try again in a moment.');
    };
    
    document.body.appendChild(button);
    console.log('[VoiceAI] Basic voice button created');
  }

  // Auto-initialize when DOM is ready
  function autoInitialize() {
    const config = getConfiguration();
    if (config.assistantId && config.vapiAssistantId) {
      initializeVoiceAssistant(config);
    } else {
      console.error('[VoiceAI] Auto-initialization failed: Missing configuration');
      console.log('[VoiceAI] Please provide data-assistant-id and data-vapi-assistant-id attributes or URL parameters');
    }
  }

  // Legacy support for manual initialization
  window.VoiceAIAssistant = {
    init: function(config) {
      console.log('[VoiceAI] Manual initialization:', config);
      return initializeVoiceAssistant(config);
    }
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInitialize);
  } else {
    autoInitialize();
  }

  console.log('[VoiceAI] Embed script loaded and ready');
})();`;

  return new Response(embedScript, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
      'Permissions-Policy': 'microphone=*, camera=*, geolocation=*, display-capture=*',
      'Feature-Policy': 'microphone *; camera *; geolocation *; display-capture *',
    },
  });
});