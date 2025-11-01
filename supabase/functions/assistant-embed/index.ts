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
    button.setAttribute('aria-label', 'Voice Assistant - Loading');
    button.setAttribute('title', 'Voice assistant is loading...');
    button.innerHTML = \`
      <svg style="width: 32px; height: 32px; color: white; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    \`;
    button.style.cssText = \`
      position: fixed !important;
      \${config.position === 'left' ? 'left: max(24px, env(safe-area-inset-left, 24px))' : 'right: max(24px, env(safe-area-inset-right, 24px))'};
      bottom: max(24px, env(safe-area-inset-bottom, 24px));
      width: 72px;
      height: 72px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.3);
      background: linear-gradient(135deg, #3b82f6 0%, #6366f1 33%, #8b5cf6 66%, #a855f7 100%);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      color: white;
      font-size: 0;
      cursor: pointer;
      box-shadow: 
        0 0 20px rgba(59, 130, 246, 0.3),
        0 8px 32px rgba(0, 0, 0, 0.25),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
      z-index: 2147483647 !important;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: translateZ(0);
      will-change: transform, box-shadow;
    \`;
    
    button.onmouseenter = function() {
      this.style.transform = 'scale(1.08) rotate(3deg) translateZ(0)';
      this.style.boxShadow = '0 0 30px rgba(59, 130, 246, 0.5), 0 12px 48px rgba(0, 0, 0, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.3)';
    };
    
    button.onmouseleave = function() {
      this.style.transform = 'translateZ(0)';
      this.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.3), 0 8px 32px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
    };
    
    button.onclick = () => {
      alert('Voice assistant is loading. Please try again in a moment.');
    };
    
    document.body.appendChild(button);

    // Add branding below widget
    const branding = document.createElement('div');
    const brandingPosition = config.position === 'left' ? 'left' : 'right';
    branding.style.cssText = \`
      position: fixed !important;
      \${brandingPosition}: max(24px, env(safe-area-inset-\${brandingPosition}, 24px));
      bottom: max(12px, calc(env(safe-area-inset-bottom, 24px) - 12px));
      font-size: 11px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      letter-spacing: 0.3px;
      z-index: 2147483646 !important;
      pointer-events: auto;
      user-select: none;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
      opacity: 0.8;
      white-space: nowrap;
    \`;
    branding.innerHTML = 'Powered by <a href="https://anvevoice.app" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none; border-bottom: 1px solid currentColor; transition: opacity 0.2s ease;">AnveVoice</a>';
    document.body.appendChild(branding);
    
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