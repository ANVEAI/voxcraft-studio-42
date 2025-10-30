import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[EMBED JS] Request received:', req.method, req.url);
  
  // Extract parameters from URL
  const url = new URL(req.url);
  const embedId = url.searchParams.get('embedId');
  const position = url.searchParams.get('position') || 'bottom-right';
  const theme = url.searchParams.get('theme') || 'light';
  
  // For backward compatibility, support old format
  let assistant = url.searchParams.get('assistant');
  let apiKey = url.searchParams.get('apiKey');
  
  // If embedId is provided, fetch mapping from database
  if (embedId) {
    try {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.4');
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const { data: mapping, error } = await supabase
        .from('embed_mappings')
        .select('vapi_assistant_id, api_key, is_active, domain_whitelist')
        .eq('embed_id', embedId)
        .single();
      
      if (error || !mapping) {
        console.error('[EMBED JS] Failed to fetch embed mapping:', error);
        return new Response(
          `console.error('Invalid embed ID: ${embedId}');`,
          {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/javascript',
            },
          }
        );
      }
      
      if (!mapping.is_active) {
        console.log('[EMBED JS] Embed is inactive:', embedId);
        return new Response(
          `console.warn('This embed has been disabled');`,
          {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/javascript',
            },
          }
        );
      }
      
      // Domain whitelist check (optional)
      const referer = req.headers.get('Referer');
      if (mapping.domain_whitelist && mapping.domain_whitelist.length > 0 && referer) {
        const refererDomain = new URL(referer).hostname;
        const isAllowed = mapping.domain_whitelist.some(domain => 
          refererDomain === domain || refererDomain.endsWith(`.${domain}`)
        );
        
        if (!isAllowed) {
          console.warn('[EMBED JS] Domain not whitelisted:', refererDomain);
          return new Response(
            `console.error('Domain not authorized for this embed');`,
            {
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/javascript',
              },
            }
          );
        }
      }
      
      assistant = mapping.vapi_assistant_id;
      apiKey = mapping.api_key;
      console.log('[EMBED JS] Embed mapping loaded:', { embedId, assistant });
    } catch (err) {
      console.error('[EMBED JS] Database lookup failed:', err);
      return new Response(
        `console.error('Failed to load embed configuration');`,
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/javascript',
          },
        }
      );
    }
  } else if (!assistant || !apiKey) {
    // If no embedId and no assistant/apiKey, return error
    return new Response(
      `console.error('Missing embed parameters');`,
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/javascript',
        },
      }
    );
  }
  
  console.log('[EMBED JS] Parameters:', { embedId, assistant, position, theme });

  const jsContent = `// VAPI-Centric Voice Automation Embed Script  
// Load Supabase JS first (add this once to your page)
if (!window.supabase) {
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/supabase-js/2.53.0/supabase.min.js';
  script.async = true;
  document.head.appendChild(script);
}

(function() {
  'use strict';
  
  // Configuration - Dynamically injected from URL parameters
  const BOT_CONFIG = {
    assistantId: "${assistant}", // Assistant ID from URL
    apiKey: "${apiKey}",         // API key from URL
    position: "${position}",     // Position from URL
    theme: "${theme}"            // Theme from URL
  };

  // Supabase configuration
  const SUPABASE_URL = 'https://mdkcdjltvfpthqudhhmx.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NDU3NTAsImV4cCI6MjA2OTUyMTc1MH0.YJAf_8-6tKTXp00h7liGNLvYC_-vJ4ttonAxP3ySvOg';

  class VAPICommandExecutor {
    constructor() {
      this.vapiWidget = null;
      this.supabaseClient = null;
      this.realtimeChannel = null;
      this.discoveryChannel = null;
      this.isInitialized = false;
      this.currentPageElements = [];
      this.statusEl = null;
      this.assistantId = null;
      this.currentCallId = null;
      this.isCallActive = false;
      this.widgetBtn = null;
      this.visualizer = null;
      this.widgetStatusEl = null;
      this.isCallInitiator = false; // Flag to track if this tab initiated the call
      this.isSessionChannelReady = false; // Track if session channel is ready
      this.queuedCommands = []; // Queue for commands received before channel is ready
      this.discoveryCleanupTimeout = null; // Timeout for cleaning up discovery channel
      this.pendingFirstCommand = null; // Store first command for replay after session setup
      this.sessionId = this.generateSessionId(); // Unique session ID for this tab instance
      
      this.init();
    }

    generateSessionId() {
      // Generate a unique session ID for this browser tab
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    init() {
      console.log('🎤 Initializing VAPI Command Executor...');
      this.createStatusIndicator();
      this.updateStatus("Loading voice automation...");
      this.analyzePageContent();
      this.setupSupabaseRealtime();
      this.loadVapiSDK();
    }

    createStatusIndicator() {
      const statusEl = document.createElement('div');
      statusEl.id = 'voice-nav-status';
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

    async setupSupabaseRealtime() {
      try {
        // Wait for Supabase to load
        let attempts = 0;
        while (!window.supabase && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!window.supabase) {
          throw new Error('Supabase JS failed to load');
        }

        this.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.assistantId = BOT_CONFIG.assistantId;
        
        console.log('[LIFECYCLE] ✅ Supabase client initialized');
        this.updateStatus('🟡 Ready for voice session...');
        
        // Discovery channel will be created on call start
        
      } catch (error) {
        console.error('❌ Supabase Realtime setup failed:', error);
        this.updateStatus("❌ Command listener failed");
      }
    }

    // Call ID Discovery Mechanism
    setupDiscoveryChannel() {
      // Clean up existing discovery channel if any
      if (this.discoveryChannel) {
        console.log('[LIFECYCLE] 🧹 Cleaning up old discovery channel');
        this.discoveryChannel.unsubscribe();
        this.discoveryChannel = null;
      }

      // Clear any pending cleanup timeout
      if (this.discoveryCleanupTimeout) {
        clearTimeout(this.discoveryCleanupTimeout);
        this.discoveryCleanupTimeout = null;
      }
      
      const discoveryChannelName = \`vapi:discovery:\${this.assistantId}:\${this.sessionId}\`;
      console.log('[LIFECYCLE] 🔍 Creating fresh discovery channel:', discoveryChannelName);
      
      this.discoveryChannel = this.supabaseClient
        .channel(discoveryChannelName)
        .on('broadcast', { event: 'call_discovery' }, (payload) => {
          console.log('[LIFECYCLE] 📡 Received call discovery:', payload);
          const { vapiCallId, firstCommand, sessionId } = payload.payload;
          
          // Only accept vapiCallId if this tab is the initiator AND sessionId matches
          if (vapiCallId && !this.currentCallId && this.isCallInitiator && sessionId === this.sessionId) {
            console.log('[LIFECYCLE] 🎯 Call ID discovered via backend for our session:', vapiCallId, 'sessionId:', sessionId);
            this.currentCallId = vapiCallId;
            
            // Store first command for replay after session channel is ready
            if (firstCommand) {
              console.log('[LIFECYCLE] 📦 Storing first command for replay:', firstCommand.functionName);
              this.pendingFirstCommand = firstCommand;
            }
            
            // Set up session-specific channel immediately
            this.subscribeToCallChannel(vapiCallId);
            this.updateStatus('🔗 Session isolated - ready for commands!');
            
            // Clean up discovery channel after a short delay (to ensure session channel is ready)
            this.discoveryCleanupTimeout = setTimeout(() => {
              if (this.discoveryChannel) {
                console.log('[LIFECYCLE] 🧹 Cleaning up discovery channel after successful setup');
                this.discoveryChannel.unsubscribe();
                this.discoveryChannel = null;
              }
            }, 2000);
          } else if (vapiCallId && sessionId !== this.sessionId) {
            console.log('[LIFECYCLE] ⏭️ Ignoring call discovery - different session (ours:', this.sessionId, 'theirs:', sessionId, ')');
          } else if (vapiCallId && !this.isCallInitiator) {
            console.log('[LIFECYCLE] ⏭️ Ignoring call discovery - not the initiator of this call');
          }
        })
        .subscribe((status) => {
          console.log('[LIFECYCLE] 🔍 Discovery channel status:', status);
        });
    }

    // VAPI-Native Session Isolation: Subscribe to call-specific channel
    subscribeToCallChannel(callId) {
      if (this.realtimeChannel) {
        console.log('[LIFECYCLE] 🧹 Unsubscribing from old session channel');
        this.realtimeChannel.unsubscribe();
      }

      // Reset channel ready state
      this.isSessionChannelReady = false;
      this.queuedCommands = [];

      const channelName = 'vapi:call:' + callId;
      console.log('[LIFECYCLE] 📡 Subscribing to session-specific channel:', channelName);
      
      this.realtimeChannel = this.supabaseClient
        .channel(channelName)
        .on('broadcast', { event: 'function_call' }, (payload) => {
          console.log('[LIFECYCLE] 📡 Received session-specific function call:', payload);
          
          // If channel is ready, execute immediately
          if (this.isSessionChannelReady) {
            this.executeFunctionCall(payload.payload);
          } else {
            // Queue the command if channel isn't fully ready
            console.log('[LIFECYCLE] ⏳ Channel not ready, queueing command:', payload.payload.functionName);
            this.queuedCommands.push(payload.payload);
          }
        })
        .subscribe((status) => {
          console.log('[LIFECYCLE] Realtime status for', channelName, ':', status);
          
          if (status === 'SUBSCRIBED') {
            this.isSessionChannelReady = true;
            this.updateStatus('🟢 Connected to voice control');
            
            // Process pending first command if exists
            if (this.pendingFirstCommand) {
              console.log('[LIFECYCLE] 🔄 Replaying first command:', this.pendingFirstCommand.functionName);
              this.executeFunctionCall(this.pendingFirstCommand);
              this.pendingFirstCommand = null;
            }
            
            console.log('[LIFECYCLE] ✅ Session channel ready, processing queued commands:', this.queuedCommands.length);
            
            // Process any other queued commands
            while (this.queuedCommands.length > 0) {
              const command = this.queuedCommands.shift();
              console.log('[LIFECYCLE] 🔄 Processing queued command:', command.functionName);
              this.executeFunctionCall(command);
            }
          }
        });

      console.log('[LIFECYCLE] ✅ Supabase Realtime setup initiated for channel:', channelName);
    }

    loadVapiSDK() {
      if (window.vapiSDK) {
        this.initializeVapi();
        return;
      }

      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js";
      script.async = true;
      script.defer = true;

      script.onload = () => {
        setTimeout(() => {
          if (window.vapiSDK) {
            this.initializeVapi();
          } else {
            this.updateStatus("❌ Voice SDK failed to load");
          }
        }, 100);
      };

      script.onerror = () => {
        this.updateStatus("❌ Voice SDK failed to load");
      };

      document.head.appendChild(script);
    }

    initializeVapi() {
      try {
        const config = {
          position: BOT_CONFIG.position,
          theme: BOT_CONFIG.theme,
          metadata: {
            sessionId: this.sessionId // Pass session ID to VAPI
          }
        };

        this.vapiWidget = window.vapiSDK.run({
          apiKey: BOT_CONFIG.apiKey,
          assistant: BOT_CONFIG.assistantId,
          config,
          assistantOverrides: {
            variableValues: {
              sessionId: this.sessionId // Also pass via variableValues
            }
          }
        });

        // Hide default button (we provide our own custom UI)
        const hideStyle = document.createElement('style');
        hideStyle.textContent = '.vapi-btn{display:none!important}';
        document.head.appendChild(hideStyle);

        this.createCustomWidget();
        this.setupVapiEventListeners();
        this.isInitialized = true;
        this.updateStatus("🎤 Click to start voice control!");
      } catch (error) {
        console.error('Vapi initialization error:', error);
        this.updateStatus("❌ Voice setup failed");
      }
    }

    createCustomWidget() {
      const widget = document.createElement('div');
      widget.id = 'voxcraft-voice-widget';
      widget.style.cssText = \`
        position: fixed !important;
        \${BOT_CONFIG.position === 'bottom-left' ? 'left: max(24px, env(safe-area-inset-left, 24px));' : 'right: max(24px, env(safe-area-inset-right, 24px));'}
        bottom: max(24px, env(safe-area-inset-bottom, 24px));
        z-index: 2147483647 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Roboto, sans-serif;
        pointer-events: none;
      \`;

      const isDark = BOT_CONFIG.theme === 'dark';
      
      const widgetHTML = \`
        <style>
          /* WordPress compatibility - reset all inherited styles */
          #voxcraft-voice-widget * {
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          /* Base button styling with enhanced glassmorphism */
          .voxcraft-widget-btn {
            all: initial;
            width: 72px !important;
            height: 72px !important;
            border-radius: 50% !important;
            background: linear-gradient(135deg, #3b82f6 0%, #6366f1 33%, #8b5cf6 66%, #a855f7 100%) !important;
            backdrop-filter: blur(20px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
            border: 2px solid \${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.3)'} !important;
            box-shadow: 
              0 0 20px rgba(59, 130, 246, 0.3),
              0 0 40px rgba(59, 130, 246, 0.15),
              0 8px 32px rgba(0, 0, 0, 0.25),
              inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            position: relative !important;
            overflow: visible !important;
            outline: none !important;
            pointer-events: auto !important;
            font-family: inherit !important;
            transform: translateZ(0) !important;
            will-change: transform, box-shadow !important;
          }
          
          /* Glassmorphism fallback for browsers without backdrop-filter */
          @supports not (backdrop-filter: blur(20px)) {
            .voxcraft-widget-btn {
              background: linear-gradient(135deg, rgba(59, 130, 246, 0.95) 0%, rgba(99, 102, 241, 0.95) 33%, rgba(139, 92, 246, 0.95) 66%, rgba(168, 85, 247, 0.95) 100%) !important;
            }
          }
          
          /* Enhanced shimmer border effect */
          .voxcraft-widget-btn::after {
            content: '' !important;
            position: absolute !important;
            top: -2px !important;
            left: -2px !important;
            right: -2px !important;
            bottom: -2px !important;
            border-radius: 50% !important;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent) !important;
            opacity: 0 !important;
            transition: opacity 0.3s !important;
            pointer-events: none !important;
          }
          
          .voxcraft-widget-btn:hover::after {
            opacity: 1 !important;
            animation: shimmer 1.5s ease-in-out infinite !important;
          }
          
          @keyframes shimmer {
            0% { transform: translateX(-100%) rotate(0deg); }
            100% { transform: translateX(100%) rotate(360deg); }
          }
          
          /* Shimmer sweep effect */
          .voxcraft-widget-btn::before {
            content: '' !important;
            position: absolute !important;
            top: 0 !important;
            left: -100% !important;
            width: 100% !important;
            height: 100% !important;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent) !important;
            transition: left 0.5s !important;
            border-radius: 50% !important;
            pointer-events: none !important;
          }
          
          .voxcraft-widget-btn:hover::before {
            left: 100% !important;
          }
          
          /* Enhanced hover state */
          .voxcraft-widget-btn:hover {
            transform: scale(1.08) rotate(3deg) translateZ(0) !important;
            box-shadow: 
              0 0 30px rgba(59, 130, 246, 0.5),
              0 0 60px rgba(59, 130, 246, 0.25),
              0 0 0 8px rgba(59, 130, 246, 0.15),
              0 12px 48px rgba(0, 0, 0, 0.3),
              inset 0 2px 0 rgba(255, 255, 255, 0.3) !important;
          }
          
          /* Active/Click state with ripple */
          .voxcraft-widget-btn:active {
            transform: scale(0.95) translateZ(0) !important;
            box-shadow: 
              0 0 15px rgba(59, 130, 246, 0.4),
              0 4px 16px rgba(0, 0, 0, 0.2) !important;
          }
          
          /* Enhanced multi-ring pulse for active states */
          .voxcraft-widget-btn.active {
            animation: multi-pulse-blue 2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
          }
          
          .voxcraft-widget-btn.listening {
            background: linear-gradient(135deg, #10b981 0%, #14b8a6 50%, #06b6d4 100%) !important;
            animation: multi-pulse-green 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
          }
          
          .voxcraft-widget-btn.speaking {
            background: linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%) !important;
            animation: multi-pulse-orange 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
          }
          
          .voxcraft-widget-btn.error {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
            animation: shake 0.5s ease-in-out !important;
          }
          
          /* Enhanced multi-layer pulse animations */
          @keyframes multi-pulse-blue {
            0% { 
              box-shadow: 
                0 0 20px rgba(59, 130, 246, 0.3),
                0 0 40px rgba(59, 130, 246, 0.15),
                0 8px 32px rgba(0, 0, 0, 0.25),
                0 0 0 0 rgba(59, 130, 246, 0.7),
                0 0 0 0 rgba(59, 130, 246, 0.4),
                inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
            }
            50% { 
              box-shadow: 
                0 0 30px rgba(59, 130, 246, 0.5),
                0 0 60px rgba(59, 130, 246, 0.25),
                0 12px 40px rgba(0, 0, 0, 0.3),
                0 0 0 12px rgba(59, 130, 246, 0.2),
                0 0 0 24px rgba(59, 130, 246, 0),
                inset 0 2px 0 rgba(255, 255, 255, 0.3) !important;
            }
            100% { 
              box-shadow: 
                0 0 20px rgba(59, 130, 246, 0.3),
                0 0 40px rgba(59, 130, 246, 0.15),
                0 8px 32px rgba(0, 0, 0, 0.25),
                0 0 0 0 rgba(59, 130, 246, 0),
                0 0 0 0 rgba(59, 130, 246, 0),
                inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
            }
          }
          
          @keyframes multi-pulse-green {
            0% { 
              box-shadow: 
                0 0 30px rgba(16, 185, 129, 0.5),
                0 0 60px rgba(16, 185, 129, 0.25),
                0 8px 32px rgba(0, 0, 0, 0.25),
                0 0 0 0 rgba(16, 185, 129, 0.7),
                inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
            }
            50% { 
              box-shadow: 
                0 0 35px rgba(16, 185, 129, 0.6),
                0 0 70px rgba(16, 185, 129, 0.3),
                0 12px 40px rgba(0, 0, 0, 0.3),
                0 0 0 15px rgba(16, 185, 129, 0.2),
                0 0 0 30px rgba(16, 185, 129, 0),
                inset 0 2px 0 rgba(255, 255, 255, 0.3) !important;
            }
            100% { 
              box-shadow: 
                0 0 30px rgba(16, 185, 129, 0.5),
                0 0 60px rgba(16, 185, 129, 0.25),
                0 8px 32px rgba(0, 0, 0, 0.25),
                0 0 0 0 rgba(16, 185, 129, 0),
                inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
            }
          }
          
          @keyframes multi-pulse-orange {
            0% { 
              box-shadow: 
                0 0 35px rgba(249, 115, 22, 0.6),
                0 0 70px rgba(249, 115, 22, 0.3),
                0 8px 32px rgba(0, 0, 0, 0.25),
                0 0 0 0 rgba(249, 115, 22, 0.7),
                inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
            }
            50% { 
              box-shadow: 
                0 0 40px rgba(249, 115, 22, 0.7),
                0 0 80px rgba(249, 115, 22, 0.35),
                0 15px 50px rgba(0, 0, 0, 0.35),
                0 0 0 18px rgba(249, 115, 22, 0.2),
                0 0 0 36px rgba(249, 115, 22, 0),
                inset 0 2px 0 rgba(255, 255, 255, 0.4) !important;
            }
            100% { 
              box-shadow: 
                0 0 35px rgba(249, 115, 22, 0.6),
                0 0 70px rgba(249, 115, 22, 0.3),
                0 8px 32px rgba(0, 0, 0, 0.25),
                0 0 0 0 rgba(249, 115, 22, 0),
                inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
            }
          }
          
          /* Error shake animation */
          @keyframes shake {
            0%, 100% { transform: translateX(0) translateZ(0); }
            25% { transform: translateX(-10px) translateZ(0); }
            75% { transform: translateX(10px) translateZ(0); }
          }
          
          /* Breathing animation for idle state */
          @keyframes breathe {
            0%, 100% { transform: scale(1) translateZ(0); }
            50% { transform: scale(1.02) translateZ(0); }
          }
          
          .voxcraft-widget-btn.idle {
            animation: breathe 3s ease-in-out infinite !important;
          }
          
          /* Enhanced icon styling */
          .voxcraft-icon {
            width: 36px !important;
            height: 36px !important;
            color: white !important;
            position: relative !important;
            z-index: 2 !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3)) !important;
            pointer-events: none !important;
            stroke-width: 3 !important;
          }
          
          .voxcraft-widget-btn:hover .voxcraft-icon {
            transform: scale(1.15) translateZ(0) !important;
            filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.4)) !important;
          }
          
          /* Enhanced visualizer panel with premium glassmorphism */
          .voxcraft-visualizer {
            position: absolute !important;
            bottom: 100% !important;
            \${BOT_CONFIG.position === 'bottom-left' ? 'left: 0 !important;' : 'right: 0 !important;'}
            margin-bottom: 16px !important;
            background: \${isDark
              ? 'rgba(15, 23, 42, 0.95)'
              : 'rgba(255, 255, 255, 0.95)'} !important;
            backdrop-filter: blur(24px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
            border: 1px solid \${isDark
              ? 'rgba(255, 255, 255, 0.15)'
              : 'rgba(0, 0, 0, 0.1)'} !important;
            border-radius: 24px !important;
            padding: 20px 24px !important;
            box-shadow: 
              0 12px 48px rgba(0, 0, 0, 0.25),
              0 0 0 1px \${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'},
              inset 0 1px 0 \${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.9)'} !important;
            display: none !important;
            flex-direction: column !important;
            gap: 14px !important;
            min-width: 260px !important;
            max-width: 320px !important;
            opacity: 0 !important;
            transform: translateY(-20px) scale(0.95) !important;
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
            pointer-events: auto !important;
            z-index: 1 !important;
          }
          
          /* Glassmorphism fallback */
          @supports not (backdrop-filter: blur(24px)) {
            .voxcraft-visualizer {
              background: \${isDark
                ? 'rgba(15, 23, 42, 0.98)'
                : 'rgba(255, 255, 255, 0.98)'} !important;
            }
          }
          
          .voxcraft-visualizer.show {
            display: flex !important;
            opacity: 1 !important;
            transform: translateY(0) scale(1) !important;
          }
          
          /* Enhanced status text */
          .voxcraft-status {
            font-size: 14px !important;
            font-weight: 600 !important;
            letter-spacing: 0.3px !important;
            color: \${isDark ? '#e5e7eb' : '#1f2937'} !important;
            text-align: center !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 8px !important;
            line-height: 1.5 !important;
            font-family: inherit !important;
          }
          
          /* Enhanced audio bars with ripple effect */
          .voxcraft-bars {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 5px !important;
            height: 40px !important;
            pointer-events: none !important;
          }
          
          .voxcraft-bar {
            width: 5px !important;
            height: 8px !important;
            background: linear-gradient(180deg, #3b82f6, #8b5cf6) !important;
            border-radius: 3px !important;
            animation: wave-advanced 1.2s ease-in-out infinite !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            transform-origin: center !important;
            will-change: height, opacity !important;
          }
          
          .voxcraft-widget-btn.listening ~ .voxcraft-visualizer .voxcraft-bar {
            background: linear-gradient(180deg, #10b981, #14b8a6) !important;
            animation: wave-advanced 1.2s ease-in-out infinite !important;
          }
          
          .voxcraft-widget-btn.speaking ~ .voxcraft-visualizer .voxcraft-bar {
            background: linear-gradient(180deg, #f59e0b, #f97316) !important;
            animation: wave-advanced 0.8s ease-in-out infinite !important;
          }
          
          /* Staggered animation delays for ripple effect */
          .voxcraft-bar:nth-child(1) { animation-delay: 0s !important; }
          .voxcraft-bar:nth-child(2) { animation-delay: 0.1s !important; }
          .voxcraft-bar:nth-child(3) { animation-delay: 0.2s !important; }
          .voxcraft-bar:nth-child(4) { animation-delay: 0.3s !important; }
          .voxcraft-bar:nth-child(5) { animation-delay: 0.2s !important; }
          .voxcraft-bar:nth-child(6) { animation-delay: 0.1s !important; }
          .voxcraft-bar:nth-child(7) { animation-delay: 0s !important; }
          
          @keyframes wave-advanced {
            0%, 100% { 
              height: 8px !important;
              opacity: 0.6 !important;
              transform: scaleY(1) !important;
            }
            50% { 
              height: 32px !important;
              opacity: 1 !important;
              transform: scaleY(1) !important;
            }
          }
          
          /* Enhanced accessibility - focus state */
          .voxcraft-widget-btn:focus-visible {
            outline: 3px solid rgba(59, 130, 246, 0.6) !important;
            outline-offset: 4px !important;
            box-shadow: 
              0 0 0 8px rgba(59, 130, 246, 0.2),
              0 0 30px rgba(59, 130, 246, 0.4) !important;
          }
          
          /* Keyboard navigation support */
          .voxcraft-widget-btn:focus {
            outline: none !important;
          }
          
          .voxcraft-widget-btn:focus:not(:focus-visible) {
            outline: none !important;
          }
          
          /* High contrast mode support */
          @media (prefers-contrast: high) {
            .voxcraft-widget-btn {
              border: 3px solid currentColor !important;
            }
            .voxcraft-visualizer {
              border: 2px solid currentColor !important;
            }
          }
          
          /* Reduced motion support */
          @media (prefers-reduced-motion: reduce) {
            .voxcraft-widget-btn,
            .voxcraft-icon,
            .voxcraft-visualizer,
            .voxcraft-bar,
            .voxcraft-widget-btn::before,
            .voxcraft-widget-btn::after {
              animation: none !important;
              transition-duration: 0.01ms !important;
            }
            .voxcraft-widget-btn:hover {
              transform: scale(1.02) translateZ(0) !important;
            }
          }
          
          /* Mobile optimization with iOS safe area support */
          @media (max-width: 768px) {
            .voxcraft-widget-btn {
              width: 68px !important;
              height: 68px !important;
            }
            .voxcraft-icon {
              width: 32px !important;
              height: 32px !important;
            }
            .voxcraft-visualizer {
              min-width: 220px !important;
              padding: 16px 20px !important;
              font-size: 13px !important;
            }
          }
          
          /* Branding text below widget */
          .voxcraft-branding {
            position: fixed !important;
            \${BOT_CONFIG.position === 'bottom-left' ? 'left: max(24px, env(safe-area-inset-left, 24px)) !important;' : 'right: max(24px, env(safe-area-inset-right, 24px)) !important;'}
            bottom: max(12px, calc(env(safe-area-inset-bottom, 24px) - 12px)) !important;
            font-size: 11px !important;
            font-weight: 500 !important;
            color: \${isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)'} !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif !important;
            letter-spacing: 0.3px !important;
            z-index: 2147483646 !important;
            pointer-events: none !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            text-align: \${BOT_CONFIG.position === 'bottom-left' ? 'left' : 'right'} !important;
            white-space: nowrap !important;
            transition: all 0.3s ease !important;
            opacity: 0.8 !important;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1) !important;
            transform: translateZ(0) !important;
          }

          .voxcraft-widget-btn:hover ~ .voxcraft-branding {
            opacity: 1 !important;
            color: \${isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)'} !important;
          }

          @media (max-width: 768px) {
            .voxcraft-branding {
              font-size: 10px !important;
              bottom: max(10px, calc(env(safe-area-inset-bottom, 20px) - 10px)) !important;
            }
          }

          @media (max-width: 480px) {
            .voxcraft-widget-btn {
              width: 64px !important;
              height: 64px !important;
            }
            .voxcraft-icon {
              width: 30px !important;
              height: 30px !important;
            }
            .voxcraft-visualizer {
              min-width: 200px !important;
              max-width: calc(100vw - 32px) !important;
            }
            .voxcraft-branding {
              font-size: 9px !important;
              bottom: max(8px, calc(env(safe-area-inset-bottom, 16px) - 8px)) !important;
            }
          }
        </style>
        
        <button 
          class="voxcraft-widget-btn idle" 
          id="voxcraft-btn" 
          aria-label="Voice Assistant - Click to start conversation" 
          role="button" 
          tabindex="0"
          title="Start voice conversation"
          aria-pressed="false"
          aria-live="polite">
          <svg class="voxcraft-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" 
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>
        
        <div class="voxcraft-visualizer" id="voxcraft-visualizer" role="status" aria-live="polite">
          <div class="voxcraft-status" id="voxcraft-status">
            <span>✨</span>
            <span>Ready to assist</span>
          </div>
          <div class="voxcraft-bars" aria-hidden="true">
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
          </div>
        </div>
        <div class="voxcraft-branding" id="voxcraft-branding">
          Powered by Anve Voice
        </div>
      \`;

      widget.innerHTML = widgetHTML;
      document.body.appendChild(widget);

      this.widgetBtn = document.getElementById('voxcraft-btn');
      this.visualizer = document.getElementById('voxcraft-visualizer');
      this.widgetStatusEl = document.getElementById('voxcraft-status');

      this.widgetBtn.addEventListener('click', () => this.toggleCall());
    }

    // Toggle call state based on vapi SDK instance
    async toggleCall() {
      if (this.isCallActive || this.vapiWidget.started) {
        this.endCall();
      } else {
        await this.startCall();
      }
    }

    async startCall() {
      try {
        console.log('[LIFECYCLE] 🚀 Starting new call...');
        this.updateWidgetState('active', 'Connecting...');
        this.visualizer.classList.add('show');
        
        // Mark this tab as the call initiator
        this.isCallInitiator = true;
        console.log('[LIFECYCLE] ✅ Marked as call initiator');
        
        // Set up discovery channel for this call
        this.setupDiscoveryChannel();
        console.log('[LIFECYCLE] ✅ Discovery channel created');
        
        // Trigger the hidden default widget to start the call
        const hiddenBtn = document.querySelector('.vapi-btn');
        if (hiddenBtn) {
          hiddenBtn.click();
        }
        
        this.isCallActive = true;
        this.updateWidgetState('listening', 'Listening...');
      } catch (error) {
        console.error('[LIFECYCLE] ❌ Start call failed:', error);
        this.isCallInitiator = false;
        this.updateWidgetState('idle', 'Failed to start');
        setTimeout(() => {
          this.visualizer.classList.remove('show');
        }, 2000);
      }
    }

    endCall() {
      try {
        // Trigger the hidden default widget to end the call
        const hiddenBtn = document.querySelector('.vapi-btn');
        if (hiddenBtn) {
          hiddenBtn.click();
        }
        
        // Reset initiator flag when call ends
        this.isCallInitiator = false;
        this.isCallActive = false;
        this.updateWidgetState('idle', 'Call ended');
        setTimeout(() => {
          this.visualizer.classList.remove('show');
        }, 2000);
      } catch (error) {
        console.error('End call failed:', error);
      }
    }

    updateWidgetState(state, statusText) {
      if (this.widgetBtn) {
        this.widgetBtn.className = \`voxcraft-widget-btn \${state}\`;
      }
      if (this.widgetStatusEl) {
        this.widgetStatusEl.textContent = statusText;
      }
    }

    setupVapiEventListeners() {
      // Call started - Wait for backend discovery
      this.vapiWidget.on("call-start", (event) => {
        console.log('📞 VAPI call started, waiting for backend call ID discovery...');
        this.updateStatus("🎤 Voice active - discovering session...");
        this.updateWidgetState('listening', 'Listening...');
      });

      // Call ended - Clean up session
      this.vapiWidget.on("call-end", () => {
        console.log('[LIFECYCLE] 📞 VAPI call ended - cleaning up...');
        this.currentCallId = null;
        this.isCallActive = false;
        this.isSessionChannelReady = false;
        this.queuedCommands = [];
        this.pendingFirstCommand = null;
        
        if (this.realtimeChannel) {
          console.log('[LIFECYCLE] 🧹 Unsubscribing session channel');
          this.realtimeChannel.unsubscribe();
          this.realtimeChannel = null;
        }
        
        if (this.discoveryChannel) {
          console.log('[LIFECYCLE] 🧹 Unsubscribing discovery channel');
          this.discoveryChannel.unsubscribe();
          this.discoveryChannel = null;
        }

        if (this.discoveryCleanupTimeout) {
          clearTimeout(this.discoveryCleanupTimeout);
          this.discoveryCleanupTimeout = null;
        }
        
        console.log('[LIFECYCLE] ✅ Call cleanup complete - ready for next call');
        
        this.updateStatus("🔄 Voice ended");
        this.updateWidgetState('idle', 'Call ended');
        setTimeout(() => {
          if (this.visualizer) {
            this.visualizer.classList.remove('show');
          }
        }, 2000);
      });

      // User speaking
      this.vapiWidget.on("speech-start", () => {
        console.log('🎤 User speaking');
        this.updateStatus("🎤 Listening...");
        this.updateWidgetState('listening', 'Listening...');
      });

      // User stopped speaking
      this.vapiWidget.on("speech-end", () => {
        console.log('🎤 User stopped speaking');
        this.updateStatus("🤖 Processing...");
        this.updateWidgetState('active', 'Processing...');
      });

      // Assistant speaking
      this.vapiWidget.on("message", (message) => {
        if (message?.type === 'transcript' && message?.transcriptType === 'partial') {
          console.log('🤖 Assistant speaking');
          this.updateStatus("🤖 Assistant responding...");
          this.updateWidgetState('speaking', 'Speaking...');
        }
      });

      // Error handling
      this.vapiWidget.on("error", (error) => {
        console.error('❌ VAPI error:', error);
        this.updateStatus("❌ Voice error");
        this.updateWidgetState('idle', 'Error occurred');
        setTimeout(() => {
          if (this.visualizer) {
            this.visualizer.classList.remove('show');
          }
        }, 3000);
      });
    }

    // Core function call executor - receives commands from VAPI via webhook -> Supabase Realtime
    executeFunctionCall(functionCall) {
      const { functionName, params } = functionCall;
      console.log('⚡ Executing function call:', functionName, params);
      
      try {
        switch (functionName) {
          case 'scroll_page':
            this.scroll_page(params);
            break;
          case 'click_element':
            this.click_element(params);
            break;
          case 'fill_field':
            this.fill_field(params);
            break;
          case 'toggle_element':
            this.toggle_element(params);
            break;
          case 'navigate_to_page':
            this.navigate_to_page(params);
            break;
          case 'get_page_context':
            this.get_page_context(params);
            break;
          default:
            console.warn('Unknown function call:', functionName);
            this.updateStatus('❓ Unknown command: ' + functionName);
        }
        this.updateStatus('✅ Executed ' + functionName);
      } catch (error) {
        console.error('❌ Function execution error:', error);
        this.updateStatus('❌ Error executing ' + functionName);
      }
    }

    // DOM manipulation functions - these contain all the DOM logic
    
    scroll_page(params) {
      const { direction, target_section } = params;
      console.log('📜 Scrolling page:', direction, target_section);
      
      // If target_section is provided, try to scroll to specific section
      if (target_section) {
        const sectionFound = this.scrollToSection(target_section);
        if (sectionFound) {
          this.updateStatus('📜 Scrolled to ' + target_section);
          return;
        }
      }
      
      // Enhanced scrolling with better amount calculations
      const scrollAmount = window.innerHeight * 0.85;
      const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      
      switch(direction?.toLowerCase()) {
        case 'down':
        case 'next':
          const downAmount = Math.min(scrollAmount, maxScroll - currentScroll);
          window.scrollBy({ 
            top: downAmount, 
            behavior: 'smooth' 
          });
          break;
          
        case 'up':
        case 'previous':
        case 'back':
          const upAmount = Math.min(scrollAmount, currentScroll);
          window.scrollBy({ 
            top: -upAmount, 
            behavior: 'smooth' 
          });
          break;
          
        case 'top':
        case 'start':
        case 'beginning':
          window.scrollTo({ 
            top: 0, 
            behavior: 'smooth' 
          });
          break;
          
        case 'bottom':
        case 'end':
          window.scrollTo({ 
            top: document.documentElement.scrollHeight, 
            behavior: 'smooth' 
          });
          break;
          
        case 'middle':
        case 'center':
          window.scrollTo({ 
            top: document.documentElement.scrollHeight / 2, 
            behavior: 'smooth' 
          });
          break;
          
        default:
          // Try to find element or section by direction text
          if (direction) {
            const element = this.findScrollTarget(direction);
            if (element) {
              element.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',
                inline: 'nearest'
              });
              this.updateStatus('📜 Scrolled to ' + direction);
              return;
            }
          }
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
      }
      
      this.updateStatus('📜 Scrolled ' + (direction || 'down'));
    }
    
    scrollToSection(sectionName) {
      const searchTerms = sectionName.toLowerCase().split(/\s+/);
      
      // Common section identifiers
      const sectionSelectors = [
        'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
        '[role="region"]', '[role="navigation"]', '[role="main"]',
        '.section', '.container', '#content', '.content',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        '[id*="section"]', '[class*="section"]'
      ];
      
      let bestMatch = null;
      let bestScore = 0;
      
      sectionSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(element => {
            if (!this.isVisible(element)) return;
            
            const elementText = (
              element.id + ' ' +
              element.className + ' ' +
              element.textContent + ' ' +
              element.getAttribute('aria-label') + ' ' +
              element.getAttribute('data-section') + ' ' +
              element.getAttribute('title')
            ).toLowerCase();
            
            let score = 0;
            searchTerms.forEach(term => {
              if (elementText.includes(term)) {
                score += term.length * (elementText.indexOf(term) === 0 ? 2 : 1);
              }
            });
            
            // Bonus for exact ID or class match
            if (element.id && element.id.toLowerCase() === sectionName.toLowerCase()) {
              score += 100;
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = element;
            }
          });
        } catch (e) {
          console.warn('Section search error:', e);
        }
      });
      
      if (bestMatch) {
        bestMatch.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
        // Adjust for fixed headers
        const offset = 80; // Typical fixed header height
        window.scrollBy(0, -offset);
        return true;
      }
      
      return false;
    }
    
    findScrollTarget(targetText) {
      const searchText = targetText.toLowerCase();
      
      // Look for anchors, headings, and sections
      const targetSelectors = [
        \`[id="\${CSS.escape(targetText)}"]\`,
        \`[id*="\${CSS.escape(searchText)}"]\`,
        \`a[name="\${CSS.escape(targetText)}"]\`,
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        '[data-section]', '[role="region"]', 'section'
      ];
      
      for (const selector of targetSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const elementText = this.getElementText(element).toLowerCase();
            const elementId = (element.id || '').toLowerCase();
            
            if (elementText.includes(searchText) || 
                elementId.includes(searchText) ||
                (element.getAttribute('data-section') || '').toLowerCase().includes(searchText)) {
              return element;
            }
          }
        } catch (e) {
          console.warn('Scroll target search error:', e);
        }
      }
      
      return null;
    }

    click_element(params) {
      const { target_text, element_type, nth_match, context_text, parent_contains, element_index } = params;
      console.log('🖱️ Finding element to click:', { target_text, element_type, nth_match, context_text, parent_contains, element_index });
      
      // ENHANCED: Context-aware element finding
      let element = null;
      
      // Strategy 1: If context_text or parent_contains provided, use context-aware search
      if (context_text || parent_contains) {
        element = this.findElementByTextWithContext(target_text, {
          context_text,
          parent_contains,
          element_index: element_index || nth_match
        });
        
        if (element) {
          console.log('✅ Found element using context-aware search');
        }
      }
      
      // Strategy 2: Try standard text search if no context or context search failed
      if (!element) {
        element = this.findElementByText(target_text);
      }
      
      // Strategy 3: If not found, try more aggressive search
      if (!element) {
        element = this.findElementByFuzzyMatch(target_text, element_type);
      }
      
      // Strategy 4: If still not found, try by partial match
      if (!element) {
        element = this.findElementByPartialMatch(target_text, nth_match || element_index || 0);
      }
      
      if (element) {
        this.performClick(element);
        const contextInfo = context_text ? ' (context: ' + context_text + ')' : '';
        this.updateStatus('✅ Clicked: ' + target_text + contextInfo);
      } else {
        // Try to provide helpful feedback
        const suggestions = this.getSimilarElements(target_text);
        if (suggestions.length > 0) {
          console.log('🔍 Similar elements found:', suggestions.map(s => s.text));
          this.updateStatus('❌ Not found. Try: ' + suggestions[0].text);
        } else {
          this.updateStatus('❌ Element not found: ' + target_text);
        }
      }
    }
    
    performClick(element) {
      try {
        // Ensure element is in view
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'center'
        });
        
        // Wait a moment then click
        setTimeout(() => {
          // Focus element for accessibility
          element.focus();
          
          // Single native click - prevents duplicate cart additions
          element.click();
          
          // Re-analyze page after click for dynamic content
          setTimeout(() => {
            this.analyzePageContent();
          }, 500);
        }, 300);
        
      } catch (error) {
        console.error('❌ Click failed:', error);
        this.updateStatus('❌ Click failed');
      }
    }
    
    navigate_to_page(params) {
      const { url, page_name } = params;
      console.log('🧭 Navigating to page:', page_name, url);
      
      // Validate URL
      if (!url) {
        console.error('❌ No URL provided for navigation');
        this.updateStatus('❌ Navigation failed: No URL');
        return;
      }
      
      // Security check: Block dangerous protocols
      try {
        const targetUrl = new URL(url);
        
        // Block javascript: and data: URLs
        if (targetUrl.protocol === 'javascript:' || targetUrl.protocol === 'data:') {
          console.error('❌ Blocked dangerous URL protocol:', targetUrl.protocol);
          this.updateStatus('❌ Navigation blocked: Invalid URL');
          return;
        }
        
        const currentUrl = new URL(window.location.href);
        
        // Show feedback to user
        this.updateStatus('🧭 Navigating to ' + page_name + '...');
        this.updateWidgetState('active', 'Going to ' + page_name);
        
        // Check if same origin - use SPA-style navigation to keep bot alive
        if (targetUrl.origin === currentUrl.origin) {
          console.log('✅ Same-origin navigation - using pushState (no reload)');
          
          // Use history.pushState to change URL without page reload
          window.history.pushState({}, '', url);
          
          // Dispatch popstate event to trigger any SPA router listeners
          window.dispatchEvent(new PopStateEvent('popstate'));
          
          // Scroll to top to mimic page navigation
          window.scrollTo({ top: 0, behavior: 'smooth' });
          
          // Update status after navigation
          setTimeout(() => {
            this.updateStatus('✅ Navigated to ' + page_name);
            this.updateWidgetState('idle', 'Ready');
          }, 800);
          
        } else {
          // Different origin - must use full page load (bot will restart)
          console.log('⚠️ Cross-origin navigation - full page reload required');
          setTimeout(() => {
            window.location.href = url;
          }, 500);
        }
        
      } catch (error) {
        console.error('❌ Invalid URL:', error);
        this.updateStatus('❌ Navigation failed: Invalid URL');
        this.updateWidgetState('idle', 'Navigation error');
      }
    }

    get_page_context(params) {
      const { detail_level = 'standard', refresh = false } = params;
      console.log('🔍 Extracting page context:', { detail_level, refresh });
      
      try {
        this.updateStatus('🔍 Analyzing page...');
        
        // Extract context based on detail level
        const context = this.extractPageContext(detail_level);
        
        console.log('📊 Page context extracted:', context);
        
        // Send context back to VAPI using SDK's send method
        if (this.vapiWidget && typeof this.vapiWidget.send === 'function') {
          this.vapiWidget.send({
            type: 'add-message',
            message: {
              role: 'system',
              content: 'Page Context (' + detail_level + '): ' + JSON.stringify(context)
            }
          });
          console.log('✅ Context sent to VAPI conversation');
          this.updateStatus('✅ Page context analyzed');
        } else {
          console.warn('⚠️ VAPI widget not available for context injection');
          this.updateStatus('⚠️ Context extracted but not sent');
        }
        
      } catch (error) {
        console.error('❌ Context extraction error:', error);
        this.updateStatus('❌ Failed to extract context');
      }
    }

    extractPageContext(detail_level) {
      const context = {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString()
      };
      
      // Minimal: Only navigation
      if (detail_level === 'minimal') {
        context.navigation = this.extractNavigation();
        return context;
      }
      
      // Standard: Navigation + interactive elements
      if (detail_level === 'standard') {
        context.navigation = this.extractNavigation();
        context.interactiveElements = this.extractInteractiveElements();
        context.pageType = this.detectPageType();
        return context;
      }
      
      // Detailed: Everything including forms and content
      if (detail_level === 'detailed') {
        context.navigation = this.extractNavigation();
        context.interactiveElements = this.extractInteractiveElements();
        context.forms = this.extractForms();
        context.contentSections = this.extractContentSections();
        context.pageType = this.detectPageType();
        return context;
      }
      
      return context;
    }

    extractNavigation() {
      const navigation = { topLevel: [] };
      const navSelectors = [
        'nav a[href]',
        '[role="navigation"] a[href]',
        'header a[href]',
        '.nav a[href]',
        '.navbar a[href]',
        '.menu a[href]'
      ];
      
      const navLinks = new Set();
      navSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(link => {
            if (this.isVisible(link) && link.href && !link.href.startsWith('javascript:')) {
              const text = this.getElementText(link);
              if (text && text.length > 0 && text.length < 50) {
                navLinks.add(JSON.stringify({
                  text: text,
                  href: link.href
                }));
              }
            }
          });
        } catch (e) {
          console.warn('Nav selector error:', selector, e);
        }
      });
      
      navigation.topLevel = Array.from(navLinks).map(item => JSON.parse(item)).slice(0, 20);
      return navigation;
    }

    extractInteractiveElements() {
      const elements = [];
      const selectors = [
        'button:not([disabled])',
        'a[href]:not([href^="#"]):not([href^="javascript:"])',
        'input[type="submit"]:not([disabled])',
        '[role="button"]:not([disabled])'
      ];
      
      selectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => {
            if (this.isVisible(el)) {
              const text = this.getElementText(el);
              if (text && text.length > 0 && text.length < 100) {
                // Get contextual information from parent elements
                const context = this.getElementContext(el);
                
                elements.push({
                  type: el.tagName.toLowerCase(),
                  text: text,
                  context: context || undefined  // Only include if context exists
                });
              }
            }
          });
        } catch (e) {
          console.warn('Element selector error:', selector, e);
        }
      });
      
      return elements.slice(0, 30);
    }

    getElementContext(element) {
      // Extract contextual information from parent elements
      const contextParts = [];
      
      // Strategy 1: Look for parent container with common product/card classes
      const parentSelectors = [
        '.product', '.product-card', '.card', '.item', 
        '[data-product]', '[data-item]', 
        'article', '[role="article"]'
      ];
      
      let parentContainer = null;
      for (const selector of parentSelectors) {
        parentContainer = element.closest(selector);
        if (parentContainer) break;
      }
      
      // If no specific parent found, use closest div with reasonable size
      if (!parentContainer) {
        let current = element.parentElement;
        let depth = 0;
        while (current && depth < 5) {
          if (current.tagName === 'DIV' || current.tagName === 'ARTICLE' || current.tagName === 'SECTION') {
            const childCount = current.children.length;
            if (childCount >= 2 && childCount <= 20) {
              parentContainer = current;
              break;
            }
          }
          current = current.parentElement;
          depth++;
        }
      }
      
      if (parentContainer) {
        // Strategy 2: Extract heading text (product name)
        const heading = parentContainer.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading) {
          const headingText = this.getElementText(heading).trim();
          if (headingText && headingText.length < 100) {
            contextParts.push(headingText);
          }
        }
        
        // Strategy 3: Extract price information
        const priceSelectors = [
          '.price', '[class*="price"]', '[data-price]',
          '.cost', '[class*="cost"]'
        ];
        
        for (const priceSelector of priceSelectors) {
          const priceEl = parentContainer.querySelector(priceSelector);
          if (priceEl && this.isVisible(priceEl)) {
            const priceText = this.getElementText(priceEl).trim();
            if (priceText && priceText.length < 50 && /[\$£€¥₹]|price|cost/i.test(priceText)) {
              contextParts.push(priceText);
              break;
            }
          }
        }
        
        // Strategy 4: Extract description (first paragraph or short text)
        const description = parentContainer.querySelector('p, .description, [class*="desc"]');
        if (description && this.isVisible(description)) {
          const descText = this.getElementText(description).trim();
          if (descText && descText.length > 10 && descText.length < 150) {
            // Take first sentence or first 100 chars
            const shortDesc = descText.split('.')[0].substring(0, 100);
            if (shortDesc && shortDesc !== contextParts[0]) {
              contextParts.push(shortDesc);
            }
          }
        }
      }
      
      // Strategy 5: Check for aria-label or title on element itself
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.length < 100 && ariaLabel !== this.getElementText(element)) {
        contextParts.unshift(ariaLabel);
      }
      
      // Return only the first context part (typically the title/heading)
      // This ensures consistent matching since titles are always present in DOM
      // Full context with separators often doesn't match exact DOM text
      if (contextParts.length > 0) {
        return contextParts[0];  // Just the title for reliable matching
      }
      
      return null;
    }

    extractForms() {
      const forms = [];
      document.querySelectorAll('form').forEach(form => {
        if (this.isVisible(form)) {
          const fields = [];
          form.querySelectorAll('input, textarea, select').forEach(field => {
            if (this.isVisible(field) && field.type !== 'hidden') {
              fields.push({
                type: field.type || field.tagName.toLowerCase(),
                name: field.name || field.id || '',
                placeholder: field.placeholder || ''
              });
            }
          });
          
          if (fields.length > 0) {
            forms.push({ fields: fields });
          }
        }
      });
      
      return forms.slice(0, 5);
    }

    extractContentSections() {
      const sections = [];
      const sectionSelectors = ['section', 'article', '[role="main"]', 'main'];
      
      sectionSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(section => {
            if (this.isVisible(section)) {
              const heading = section.querySelector('h1, h2, h3');
              const headingText = heading ? this.getElementText(heading) : '';
              
              if (headingText) {
                sections.push({
                  heading: headingText,
                  hasButtons: section.querySelectorAll('button').length > 0
                });
              }
            }
          });
        } catch (e) {
          console.warn('Section selector error:', selector, e);
        }
      });
      
      return sections.slice(0, 10);
    }

    detectPageType() {
      const url = window.location.href.toLowerCase();
      
      if (url.includes('/product') || url.includes('/item')) return 'product_page';
      if (url.includes('/cart') || url.includes('/checkout')) return 'cart_page';
      if (url.includes('/search') || url.includes('?q=')) return 'search_results';
      if (url === window.location.origin + '/' || url === window.location.origin) return 'landing_page';
      
      return 'general_page';
    }
    
    findElementByFuzzyMatch(targetText, elementType) {
      const searchTerms = targetText.toLowerCase().split(/\s+/);
      let bestMatch = null;
      let bestScore = 0;
      
      // Define element type filters
      const typeFilters = {
        'button': ['button', '[role="button"]', 'input[type="button"]', 'input[type="submit"]', '.btn', '.button'],
        'link': ['a[href]'],
        'input': ['input', 'textarea'],
        'checkbox': ['input[type="checkbox"]'],
        'radio': ['input[type="radio"]'],
        'dropdown': ['select'],
        'menu': ['[role="menu"]', '[role="menuitem"]', '.menu', '.dropdown']
      };
      
      const selectors = elementType && typeFilters[elementType] ? 
        typeFilters[elementType] : 
        Object.values(typeFilters).flat();
      
      selectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(element => {
            if (!this.isVisible(element)) return;
            
            const elementText = this.getCompleteElementText(element).toLowerCase();
            
            let score = 0;
            searchTerms.forEach(term => {
              if (elementText.includes(term)) {
                score += term.length;
                // Bonus for word boundary matches
                if (new RegExp('\\b' + term + '\\b').test(elementText)) {
                  score += term.length * 0.5;
                }
              }
            });
            
            // Normalize score by element text length to prefer shorter exact matches
            if (elementText.length > 0) {
              score = score / Math.sqrt(elementText.length);
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = element;
            }
          });
        } catch (e) {
          console.warn('Fuzzy match error:', e);
        }
      });
      
      return bestMatch;
    }
    
    findElementByPartialMatch(targetText, nthMatch = 0) {
      const searchText = targetText.toLowerCase();
      const matches = [];
      
      // Get all clickable elements
      const clickableElements = document.querySelectorAll(
        'a, button, [role="button"], input[type="submit"], input[type="button"], [onclick], [ng-click], [data-click]'
      );
      
      clickableElements.forEach(element => {
        if (!this.isVisible(element)) return;
        
        const elementText = this.getCompleteElementText(element).toLowerCase();
        
        if (elementText.includes(searchText)) {
          matches.push(element);
        }
      });
      
      return matches[nthMatch] || null;
    }
    
    getSimilarElements(targetText) {
      const searchText = targetText.toLowerCase();
      const similar = [];
      const maxSuggestions = 3;
      
      this.currentPageElements.forEach(item => {
        const itemText = item.text.toLowerCase();
        const similarity = this.calculateSimilarity(searchText, itemText);
        
        if (similarity > 0.3) { // 30% similarity threshold
          similar.push({
            element: item.element,
            text: item.text,
            similarity: similarity
          });
        }
      });
      
      // Sort by similarity and return top matches
      return similar
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxSuggestions);
    }
    
    calculateSimilarity(str1, str2) {
      const longer = str1.length > str2.length ? str1 : str2;
      const shorter = str1.length > str2.length ? str2 : str1;
      
      if (longer.length === 0) return 1.0;
      
      const editDistance = this.levenshteinDistance(longer, shorter);
      return (longer.length - editDistance) / longer.length;
    }
    
    levenshteinDistance(str1, str2) {
      const matrix = [];
      
      for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
      }
      
      for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
      }
      
      for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
          if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
          }
        }
      }
      
      return matrix[str2.length][str1.length];
    }
    
    getCompleteElementText(element) {
      // Get text from multiple sources for better matching
      const texts = [
        element.textContent?.trim(),
        element.innerText?.trim(),
        element.value?.trim(),
        element.alt?.trim(),
        element.title?.trim(),
        element.placeholder?.trim(),
        element.getAttribute('aria-label')?.trim(),
        element.getAttribute('data-text')?.trim(),
        element.getAttribute('data-title')?.trim(),
        element.getAttribute('data-original-title')?.trim(), // Bootstrap tooltips
        element.getAttribute('data-content')?.trim()
      ].filter(Boolean);
      
      return texts.join(' ');
    }

    fill_field(params) {
      const { value, field_hint, field_type, submit_after } = params;
      console.log('✏️ Filling field:', value, field_hint, field_type);
      
      // Find form field based on hint, type, or proximity
      const field = this.findFieldByHint(field_hint || value, field_type);
      
      if (field) {
        // Clear existing value first
        field.value = '';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Set focus to field
        field.focus();
        
        // Fill the field character by character for better compatibility
        if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
          // Use more robust filling method
          this.fillFieldRobustly(field, value);
        } else if (field.tagName === 'SELECT') {
          // Handle dropdown selection
          this.selectDropdownOption(field, value);
        }
        
        // Trigger all necessary events
        const events = ['input', 'change', 'blur', 'keyup'];
        events.forEach(eventType => {
          field.dispatchEvent(new Event(eventType, { 
            bubbles: true, 
            cancelable: true 
          }));
        });
        
        // Also dispatch KeyboardEvent for better compatibility
        field.dispatchEvent(new KeyboardEvent('keydown', { 
          bubbles: true,
          cancelable: true,
          key: 'Enter',
          keyCode: 13
        }));
        
        this.updateStatus('✅ Filled field: ' + value);
        
        // Auto-submit if requested
        if (submit_after) {
          setTimeout(() => {
            this.submitForm(field);
          }, 500);
        }
      } else {
        this.updateStatus('❌ Field not found: ' + (field_hint || 'any'));
      }
    }
    
    fillFieldRobustly(field, value) {
      try {
        // Method 1: Direct value setting with proper event sequence
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        
        const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value'
        )?.set;
        
        const valueSetter = field.tagName === 'TEXTAREA' ? 
          nativeTextAreaValueSetter : 
          nativeInputValueSetter;
        
        if (valueSetter) {
          valueSetter.call(field, value);
        } else {
          field.value = value;
        }
        
        // Method 2: Simulate typing for React/Vue/Angular compatibility
        const inputEvent = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: value
        });
        field.dispatchEvent(inputEvent);
        
        // Method 3: For contenteditable elements
        if (field.contentEditable === 'true') {
          field.textContent = value;
          field.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
      } catch (error) {
        console.warn('Robust fill fallback:', error);
        field.value = value;
      }
    }
    
    selectDropdownOption(selectField, value) {
      const valueLower = value.toLowerCase();
      let optionFound = false;
      
      // Try to find option by text or value
      Array.from(selectField.options).forEach(option => {
        const optionText = option.textContent.toLowerCase();
        const optionValue = option.value.toLowerCase();
        
        if (optionText.includes(valueLower) || 
            optionValue.includes(valueLower) ||
            optionText === valueLower ||
            optionValue === valueLower) {
          option.selected = true;
          optionFound = true;
        }
      });
      
      if (!optionFound && selectField.options.length > 0) {
        // Fallback: select first non-empty option
        for (let i = 0; i < selectField.options.length; i++) {
          if (selectField.options[i].value) {
            selectField.options[i].selected = true;
            break;
          }
        }
      }
    }
    
    submitForm(field) {
      // Find the parent form
      const form = field.closest('form');
      
      if (form) {
        // Try to submit the form
        const submitButton = form.querySelector(
          'button[type="submit"], input[type="submit"], button:not([type="button"])'
        );
        
        if (submitButton) {
          submitButton.click();
        } else {
          form.submit();
        }
        
        this.updateStatus('📤 Form submitted');
      } else {
        // Look for a nearby submit button
        const nearbySubmit = this.findNearbySubmitButton(field);
        if (nearbySubmit) {
          nearbySubmit.click();
          this.updateStatus('📤 Triggered submission');
        }
      }
    }
    
    findNearbySubmitButton(field) {
      // Look for submit buttons in the same container
      const container = field.closest('div, section, article, form');
      if (!container) return null;
      
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:contains("submit")',
        'button:contains("search")',
        'button:contains("go")',
        'button:contains("enter")',
        '[role="button"][type="submit"]'
      ];
      
      for (const selector of submitSelectors) {
        try {
          const button = container.querySelector(selector);
          if (button && this.isVisible(button)) {
            return button;
          }
        } catch (e) {
          // Some selectors might not be valid
          continue;
        }
      }
      
      // Fallback: any visible button in container
      const anyButton = container.querySelector('button:not([disabled])');
      return anyButton && this.isVisible(anyButton) ? anyButton : null;
    }

    toggle_element(params) {
      const { target, toggle_state } = params;
      console.log('🔄 Toggling element:', target, toggle_state);
      
      const element = this.findElementByText(target) || 
                     this.findToggleableElement(target);
      
      if (element) {
        const toggled = this.performToggle(element, toggle_state);
        
        if (toggled) {
          this.updateStatus('✅ Toggled: ' + target);
        } else {
          this.updateStatus('⚠️ Toggle may not have worked: ' + target);
        }
      } else {
        this.updateStatus('❌ Toggle element not found: ' + target);
      }
    }
    
    performToggle(element, desiredState) {
      try {
        let toggled = false;
        
        // Handle different types of toggle elements
        if (element.type === 'checkbox' || element.type === 'radio') {
          // Checkbox or radio button
          const previousState = element.checked;
          
          if (desiredState === undefined) {
            element.checked = !element.checked;
          } else if (desiredState === 'on' || desiredState === true) {
            element.checked = true;
          } else if (desiredState === 'off' || desiredState === false) {
            element.checked = false;
          }
          
          // Trigger change event
          element.dispatchEvent(new Event('change', { bubbles: true }));
          toggled = element.checked !== previousState;
          
        } else if (element.tagName === 'SELECT') {
          // Dropdown toggle
          if (element.size > 1 || element.multiple) {
            // Multi-select
            const options = element.querySelectorAll('option');
            options.forEach(option => {
              option.selected = !option.selected;
            });
            element.dispatchEvent(new Event('change', { bubbles: true }));
            toggled = true;
          }
          
        } else if (element.getAttribute('role') === 'switch' || 
                   element.classList.contains('switch') ||
                   element.classList.contains('toggle')) {
          // ARIA switch or custom toggle
          const isOn = element.getAttribute('aria-checked') === 'true' ||
                       element.classList.contains('on') ||
                       element.classList.contains('active') ||
                       element.classList.contains('checked');
          
          if (desiredState === undefined) {
            this.setToggleState(element, !isOn);
          } else {
            this.setToggleState(element, desiredState === 'on' || desiredState === true);
          }
          
          element.click();
          toggled = true;
          
        } else if (element.hasAttribute('aria-expanded')) {
          // Expandable/collapsible element
          const isExpanded = element.getAttribute('aria-expanded') === 'true';
          element.setAttribute('aria-expanded', !isExpanded);
          element.click();
          toggled = true;
          
        } else if (element.hasAttribute('aria-pressed')) {
          // Toggle button
          const isPressed = element.getAttribute('aria-pressed') === 'true';
          element.setAttribute('aria-pressed', !isPressed);
          element.click();
          toggled = true;
          
        } else {
          // Generic toggle - try various strategies
          const toggleClasses = ['active', 'on', 'open', 'selected', 'checked', 'expanded'];
          let hasToggleClass = false;
          
          toggleClasses.forEach(className => {
            if (element.classList.contains(className)) {
              element.classList.remove(className);
              hasToggleClass = true;
            } else if (!hasToggleClass) {
              element.classList.add(className);
            }
          });
          
          // Always click to trigger any JavaScript handlers
          element.click();
          toggled = true;
        }
        
        // Trigger additional events for better compatibility
        const events = ['toggle', 'change', 'input'];
        events.forEach(eventType => {
          try {
            element.dispatchEvent(new Event(eventType, { bubbles: true }));
          } catch (e) {
            // Some events might not be applicable
          }
        });
        
        return toggled;
        
      } catch (error) {
        console.error('Toggle error:', error);
        // Fallback: just click the element
        element.click();
        return true;
      }
    }
    
    setToggleState(element, state) {
      if (state) {
        element.classList.add('on', 'active', 'checked');
        element.classList.remove('off', 'inactive');
        element.setAttribute('aria-checked', 'true');
      } else {
        element.classList.remove('on', 'active', 'checked');
        element.classList.add('off');
        element.setAttribute('aria-checked', 'false');
      }
    }
    
    findToggleableElement(searchText) {
      const searchLower = searchText.toLowerCase();
      
      // Specific selectors for toggle elements
      const toggleSelectors = [
        'input[type="checkbox"]',
        'input[type="radio"]',
        '[role="switch"]',
        '[role="checkbox"]',
        '[aria-checked]',
        '[aria-pressed]',
        '[aria-expanded]',
        '.switch',
        '.toggle',
        '.checkbox',
        '.radio',
        '[data-toggle]',
        '.btn-toggle'
      ];
      
      let bestMatch = null;
      let bestScore = 0;
      
      toggleSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(element => {
            if (!this.isVisible(element)) return;
            
            // Get associated label text
            const labelText = this.getToggleLabelText(element).toLowerCase();
            
            if (labelText.includes(searchLower)) {
              const score = searchLower.length / labelText.length;
              if (score > bestScore) {
                bestScore = score;
                bestMatch = element;
              }
            }
          });
        } catch (e) {
          console.warn('Toggle search error:', e);
        }
      });
      
      return bestMatch;
    }
    
    getToggleLabelText(element) {
      // Get label text for toggle element
      let labelText = '';
      
      // Check for associated label
      if (element.id) {
        const label = document.querySelector('label[for="' + element.id + '"]');
        if (label) {
          labelText += label.textContent + ' ';
        }
      }
      
      // Check parent label
      const parentLabel = element.closest('label');
      if (parentLabel) {
        labelText += parentLabel.textContent + ' ';
      }
      
      // Check aria-label and other attributes
      labelText += (element.getAttribute('aria-label') || '') + ' ';
      labelText += (element.getAttribute('title') || '') + ' ';
      labelText += (element.getAttribute('data-label') || '') + ' ';
      
      // Check nearby text
      const nextSibling = element.nextElementSibling;
      if (nextSibling && nextSibling.tagName !== 'INPUT') {
        labelText += nextSibling.textContent + ' ';
      }
      
      const previousSibling = element.previousElementSibling;
      if (previousSibling && previousSibling.tagName !== 'INPUT') {
        labelText += previousSibling.textContent + ' ';
      }
      
      return labelText.trim();
    }

    // Helper functions for element finding and manipulation
    
    findElementByText(targetText) {
      const searchText = targetText.toLowerCase();
      let bestElement = null;
      let bestScore = 0;
      
      this.currentPageElements.forEach(item => {
        const itemText = item.text.toLowerCase();
        const itemHref = (item.href || '').toLowerCase();
        
        // Calculate match score
        let score = 0;
        if (itemText.includes(searchText)) {
          score += searchText.length;
          if (itemText === searchText) score += 10; // Exact match bonus
        }
        if (itemHref.includes(searchText)) {
          score += searchText.length * 0.5;
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestElement = item.element;
        }
      });
      
      return bestElement;
    }

    // ENHANCED: Context-aware element finding for disambiguating repeated elements
    findElementByTextWithContext(targetText, options = {}) {
      const { context_text, parent_contains, element_index } = options;
      const searchText = targetText.toLowerCase();
      const contextSearchText = (context_text || parent_contains || '').toLowerCase();
      
      console.log('🔍 Context-aware search:', { targetText, contextSearchText, element_index });
      
      // Find all elements matching the target text
      const matchingElements = [];
      
      this.currentPageElements.forEach(item => {
        const itemText = item.text.toLowerCase();
        
        if (itemText.includes(searchText) || itemText === searchText) {
          matchingElements.push(item.element);
        }
      });
      
      // Also search in DOM for elements not in currentPageElements
      const allElements = document.querySelectorAll('button, a, [role="button"], [onclick], input[type="button"], input[type="submit"]');
      allElements.forEach(el => {
        const elText = this.getElementText(el).toLowerCase();
        if ((elText.includes(searchText) || elText === searchText) && !matchingElements.includes(el)) {
          matchingElements.push(el);
        }
      });
      
      console.log('🔍 Found ' + matchingElements.length + ' elements matching "' + targetText + '"');
      
      // If no context provided or only one match, return first match
      if (!contextSearchText || matchingElements.length <= 1) {
        return matchingElements[element_index || 0] || matchingElements[0] || null;
      }
      
      // Filter by context: find elements whose parent/ancestor contains the context text
      const contextMatches = [];
      
      matchingElements.forEach(element => {
        // Search up the DOM tree for context text
        let currentNode = element.parentElement;
        let maxDepth = 10; // Limit how far up we search
        let depth = 0;
        
        while (currentNode && depth < maxDepth) {
          const parentText = currentNode.textContent?.toLowerCase() || '';
          
          if (parentText.includes(contextSearchText)) {
            // Calculate a score based on how close the context is
            const score = maxDepth - depth; // Closer parents get higher scores
            contextMatches.push({ element, score, depth });
            console.log('✅ Found context match at depth ' + depth + ':', {
              element: this.getElementText(element),
              context: currentNode.textContent?.substring(0, 100)
            });
            break;
          }
          
          currentNode = currentNode.parentElement;
          depth++;
        }
      });
      
      if (contextMatches.length === 0) {
        console.warn('⚠️ No context matches found for "' + contextSearchText + '", falling back to first match');
        return matchingElements[element_index || 0] || matchingElements[0] || null;
      }
      
      // Sort by score (closer context = higher score) and return the best match
      contextMatches.sort((a, b) => b.score - a.score);
      
      const selectedMatch = contextMatches[element_index || 0] || contextMatches[0];
      console.log('✅ Selected element with context at depth ' + selectedMatch.depth);
      
      return selectedMatch.element;
    }

    findFieldByHint(hint) {
      const hintLower = hint.toLowerCase();
      const fields = document.querySelectorAll('input, textarea, select');
      
      for (const field of fields) {
        const fieldText = (
          field.placeholder + ' ' +
          field.name + ' ' +
          field.id + ' ' +
          (field.labels?.[0]?.textContent || '') + ' ' +
          (field.previousElementSibling?.textContent || '') + ' ' +
          (field.nextElementSibling?.textContent || '')
        ).toLowerCase();
        
        if (fieldText.includes(hintLower) || 
            (hint.includes('email') && field.type === 'email') ||
            (hint.includes('password') && field.type === 'password') ||
            (hint.includes('name') && field.name.includes('name'))) {
          return field;
        }
      }
      
      // Fallback: return first visible input
      return document.querySelector('input:not([type="hidden"]):not([disabled])');
    }

    clickElement(element) {
      try {
        console.log('🖱️ Clicking element:', this.getElementText(element));
        
        // Scroll element into view first
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Wait a moment then click
        setTimeout(() => {
          element.focus();
          element.click();
          
          // Re-analyze page after click (for dynamic content)
          setTimeout(() => {
            this.analyzePageContent();
          }, 1000);
        }, 300);
        
      } catch (error) {
        console.error('❌ Click failed:', error);
        this.updateStatus('❌ Click failed');
      }
    }

    analyzePageContent() {
      console.log('🔍 Analyzing page content...');
      this.currentPageElements = [];
      
      // Comprehensive selectors for interactive elements
      const selectors = [
        'a[href]:not([href^="#"]):not([href^="javascript:"]):not([href^="mailto:"]):not([href^="tel:"])',
        'button:not([disabled])',
        '[role="button"]:not([disabled])',
        'input[type="submit"]:not([disabled])',
        'input[type="button"]:not([disabled])',
        'input[type="checkbox"]',
        'input[type="radio"]',
        '.btn:not([disabled])',
        '.button:not([disabled])',
        '[onclick]',
        '[data-toggle]',
        '.toggle',
        '.switch'
      ];
      
      selectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => {
            if (this.isVisible(el)) {
              const text = this.getElementText(el);
              if (text && text.length > 0) {
                this.currentPageElements.push({
                  element: el,
                  text: text,
                  href: el.href || ''
                });
              }
            }
          });
        } catch (e) {
          console.warn('Selector error:', selector, e);
        }
      });
      
      console.log(\`🔍 Found \${this.currentPageElements.length} interactive elements\`);
    }

    isVisible(element) {
      try {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        
        return rect.width > 0 && 
               rect.height > 0 && 
               style.display !== 'none' && 
               style.visibility !== 'hidden' &&
               parseFloat(style.opacity) > 0;
      } catch (e) {
        return false;
      }
    }

    getElementText(element) {
      try {
        // Get element text content with fallbacks
        return element.textContent?.trim() || 
               element.innerText?.trim() || 
               element.value?.trim() || 
               element.alt?.trim() || 
               element.title?.trim() || 
               element.placeholder?.trim() || 
               element.getAttribute('aria-label')?.trim() || 
               element.className?.trim() || 
               '';
      } catch (e) {
        return '';
      }
    }

    updateStatus(message) {
      if (this.statusEl) {
        this.statusEl.textContent = message;
        console.log('📊 Status:', message);
      }
    }

    // Cleanup method
    destroy() {
      if (this.realtimeChannel) {
        this.realtimeChannel.unsubscribe();
      }
      if (this.vapiWidget) {
        // VAPI cleanup if needed
      }
    }
  }

  // Initialize the VAPI Command Executor when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.vapiCommandExecutor = new VAPICommandExecutor();
    });
  } else {
    window.vapiCommandExecutor = new VAPICommandExecutor();
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (window.vapiCommandExecutor) {
      window.vapiCommandExecutor.destroy();
    }
  });

})();`;

  return new Response(jsContent, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Expose-Headers': 'Content-Length'
    }
  });
});