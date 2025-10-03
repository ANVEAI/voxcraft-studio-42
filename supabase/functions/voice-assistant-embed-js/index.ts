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
  const assistant = url.searchParams.get('assistant') || 'default-assistant';
  const apiKey = url.searchParams.get('apiKey') || 'default-key';
  const position = url.searchParams.get('position') || 'bottom-right';
  const theme = url.searchParams.get('theme') || 'light';
  
  console.log('[EMBED JS] Parameters:', { assistant, position, theme });

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
      this.mappingChannel = null; // Channel for session mapping registration
      this.discoveryChannel = null; // Channel for call ID discovery
      this.isInitialized = false;
      this.currentPageElements = [];
      this.statusEl = null;
      this.assistantId = null;
      this.currentCallId = null;
      this.isCallActive = false;
      this.widgetBtn = null;
      this.visualizer = null;
      this.widgetStatusEl = null;
      this.sessionId = null; // Unique session identifier
      
      this.init();
    }

    // Generate unique session ID for this browser tab
    generateSessionId() {
      // Check if session ID already exists in sessionStorage
      let sessionId = sessionStorage.getItem('vapi_session_id');
      
      if (!sessionId) {
        // Generate new unique session ID
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          sessionId = crypto.randomUUID();
        } else {
          // Fallback for older browsers
          sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        sessionStorage.setItem('vapi_session_id', sessionId);
      }
      
      return sessionId;
    }

    init() {
      console.log('🎤 Initializing VAPI Command Executor...');
      
      // Generate unique session ID for this browser tab
      this.sessionId = this.generateSessionId();
      console.log('🔑 Session ID:', this.sessionId);
      
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
        
        console.log('✅ Supabase client initialized, setting up discovery mechanism...');
        this.updateStatus('🟡 Waiting for voice session...');
        
        // Set up discovery channel
        this.setupDiscoveryChannel();
        
      } catch (error) {
        console.error('❌ Supabase Realtime setup failed:', error);
        this.updateStatus("❌ Command listener failed");
      }
    }

    // Call ID Discovery Mechanism
    setupDiscoveryChannel() {
      const discoveryChannelName = \`vapi:discovery:\${this.assistantId}\`;
      console.log('🔍 Setting up discovery channel:', discoveryChannelName);
      
      this.discoveryChannel = this.supabaseClient
        .channel(discoveryChannelName)
        .on('broadcast', { event: 'call_discovery' }, (payload) => {
          console.log('📡 Received call discovery:', payload);
          const { vapiCallId } = payload.payload;
          
          if (vapiCallId && !this.currentCallId) {
            console.log('🎯 Call ID discovered via backend:', vapiCallId);
            this.currentCallId = vapiCallId;
            
            // Clean up discovery channel
            if (this.discoveryChannel) {
              this.discoveryChannel.unsubscribe();
              this.discoveryChannel = null;
            }
            
            // Set up session-specific channel
            this.subscribeToCallChannel(vapiCallId);
            this.updateStatus('🔗 Session isolated - ready for commands!');
          }
        })
        .subscribe((status) => {
          console.log('🔍 Discovery channel status:', status);
        });
    }

    // VAPI-Native Session Isolation: Subscribe to both general and isolated channels during grace period
    subscribeToCallChannelWithFallback(callId) {
      const isolatedChannelName = \`vapi:call:\${callId}:\${this.sessionId}\`;
      const generalChannelName = \`vapi:call:\${callId}\`;
      
      console.log('📡 Setting up dual-channel subscription for race condition handling');
      console.log('🔐 Isolated channel:', isolatedChannelName);
      console.log('🌐 General channel (fallback):', generalChannelName);
      
      const processedEvents = new Set(); // Dedupe events
      let isolatedChannelWorking = false;
      
      const handleFunctionCall = (payload, source) => {
        const eventKey = \`\${payload.payload?.callId}-\${payload.payload?.functionName}-\${payload.payload?.timestamp}\`;
        
        if (processedEvents.has(eventKey)) {
          console.log('⏭️ Skipping duplicate event from', source);
          return;
        }
        
        processedEvents.add(eventKey);
        console.log(\`📡 Processing function call from \${source}:\`, payload.payload);
        
        if (source === 'isolated') {
          isolatedChannelWorking = true;
        }
        
        this.executeFunctionCall(payload.payload);
      };
      
      // Subscribe to ISOLATED channel (primary)
      if (this.realtimeChannel) {
        this.realtimeChannel.unsubscribe();
      }
      
      this.realtimeChannel = this.supabaseClient
        .channel(isolatedChannelName)
        .on('broadcast', { event: 'function_call' }, (payload) => {
          handleFunctionCall(payload, 'isolated');
        })
        .subscribe((status) => {
          console.log('📡 Isolated channel status:', status, isolatedChannelName);
          if (status === 'SUBSCRIBED') {
            this.updateStatus('🟢 Connected (Isolated Session: ' + this.sessionId.substr(0, 8) + '...)');
          }
        });
      
      // Subscribe to GENERAL channel (fallback for grace period)
      const generalChannel = this.supabaseClient
        .channel(generalChannelName)
        .on('broadcast', { event: 'function_call' }, (payload) => {
          if (!isolatedChannelWorking) {
            console.log('⚠️ Using general channel fallback');
            handleFunctionCall(payload, 'general-fallback');
          }
        })
        .subscribe((status) => {
          console.log('📡 General fallback channel status:', status, generalChannelName);
        });
      
      // Clean up general channel after grace period (3 seconds)
      setTimeout(() => {
        if (isolatedChannelWorking) {
          console.log('✅ Isolated channel working, unsubscribing from general fallback');
          generalChannel.unsubscribe();
        } else {
          console.warn('⚠️ Isolated channel not receiving events, keeping general fallback active');
        }
      }, 3000);
      
      console.log('✅ Dual-channel setup complete with 3s grace period');
    }
    
    // Legacy method - kept for discovery channel fallback compatibility
    subscribeToCallChannel(callId) {
      this.subscribeToCallChannelWithFallback(callId);
    }

    // Register call-to-session mapping for backend routing with proper subscription
    registerSessionMapping(callId) {
      const mappingChannelName = \`vapi:session-mapping:\${this.assistantId}\`;
      console.log('📝 Registering session mapping:', { callId, sessionId: this.sessionId.substr(0, 8) + '...' });
      
      const mappingMessage = {
        type: 'session_mapping',
        callId: callId,
        sessionId: this.sessionId,
        assistantId: this.assistantId,
        timestamp: new Date().toISOString()
      };
      
      let retryCount = 0;
      const maxRetries = 3;
      const subscriptionTimeout = 5000; // 5 seconds
      
      const attemptRegistration = () => {
        console.log(\`📡 Subscribing to mapping channel (attempt \${retryCount + 1})...\`);
        
        // Create a new channel and subscribe first
        const mappingChannel = this.supabaseClient.channel(mappingChannelName);
        
        let timeoutHandle;
        let isComplete = false;
        
        // Set subscription timeout
        timeoutHandle = setTimeout(() => {
          if (!isComplete) {
            console.warn('⏰ Subscription timeout - retrying...');
            mappingChannel.unsubscribe();
            
            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(attemptRegistration, 500);
            } else {
              console.error('❌ Session mapping registration failed after', maxRetries, 'attempts');
            }
          }
        }, subscriptionTimeout);
        
        mappingChannel.subscribe(async (status) => {
          console.log('📡 Mapping channel status:', status);
          
          if (status === 'SUBSCRIBED' && !isComplete) {
            isComplete = true;
            clearTimeout(timeoutHandle);
            
            console.log('✅ Mapping channel subscribed, sending session mapping...');
            
            try {
              // Now send the broadcast message
              await mappingChannel.send({
                type: 'broadcast',
                event: 'register_session',
                payload: mappingMessage
              });
              
              console.log('✅ Session mapping sent successfully!');
              console.log('🔐 Session isolation active:', { callId, sessionId: this.sessionId.substr(0, 8) + '...' });
              
              // Store reference for cleanup
              this.mappingChannel = mappingChannel;
              
              // Send again after 1 second to ensure backend received it
              setTimeout(async () => {
                console.log('🔄 Re-sending session mapping for redundancy...');
                try {
                  await mappingChannel.send({
                    type: 'broadcast',
                    event: 'register_session',
                    payload: mappingMessage
                  });
                  console.log('✅ Redundant session mapping sent');
                } catch (error) {
                  console.warn('⚠️ Failed to send redundant mapping:', error);
                }
              }, 1000);
              
            } catch (error) {
              console.error('❌ Failed to send session mapping:', error);
              
              if (retryCount < maxRetries) {
                retryCount++;
                mappingChannel.unsubscribe();
                setTimeout(attemptRegistration, 500);
              }
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (!isComplete) {
              isComplete = true;
              clearTimeout(timeoutHandle);
              console.error('❌ Channel error or timeout:', status);
              
              if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(attemptRegistration, 500);
              }
            }
          }
        });
      };
      
      // Start registration attempt
      attemptRegistration();
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
          theme: BOT_CONFIG.theme
        };

        this.vapiWidget = window.vapiSDK.run({
          apiKey: BOT_CONFIG.apiKey,
          assistant: BOT_CONFIG.assistantId,
          config
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
        position: fixed;
        \${BOT_CONFIG.position === 'bottom-left' ? 'left: 24px;' : 'right: 24px;'}
        bottom: 24px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      \`;

      const isDark = BOT_CONFIG.theme === 'dark';
      
      const widgetHTML = \`
        <style>
          .voxcraft-widget-btn {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: \${isDark 
              ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(139, 92, 246, 0.9))'
              : 'linear-gradient(135deg, rgb(59, 130, 246), rgb(139, 92, 246))'};
            backdrop-filter: blur(20px);
            border: 2px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
          }
          .voxcraft-widget-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3), 0 0 0 8px rgba(59, 130, 246, 0.2);
          }
          .voxcraft-widget-btn.active {
            animation: pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          .voxcraft-widget-btn.listening {
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.9), rgba(16, 185, 129, 0.9));
            animation: pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          .voxcraft-widget-btn.speaking {
            background: linear-gradient(135deg, rgba(249, 115, 22, 0.9), rgba(234, 88, 12, 0.9));
          }
          @keyframes pulse-ring {
            0% { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 0 rgba(59, 130, 246, 0.7); }
            50% { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 12px rgba(59, 130, 246, 0); }
            100% { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 0 rgba(59, 130, 246, 0); }
          }
          .voxcraft-icon {
            width: 28px;
            height: 28px;
            color: white;
            position: relative;
            z-index: 2;
            transition: transform 0.3s ease;
          }
          .voxcraft-widget-btn:hover .voxcraft-icon {
            transform: scale(1.1);
          }
          .voxcraft-visualizer {
            position: absolute;
            bottom: 100%;
            \${BOT_CONFIG.position === 'bottom-left' ? 'left: 0;' : 'right: 0;'}
            margin-bottom: 12px;
            background: \${isDark
              ? 'rgba(30, 30, 46, 0.95)'
              : 'rgba(255, 255, 255, 0.95)'};
            backdrop-filter: blur(20px);
            border: 1px solid \${isDark
              ? 'rgba(255, 255, 255, 0.1)'
              : 'rgba(0, 0, 0, 0.1)'};
            border-radius: 16px;
            padding: 16px 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            display: none;
            flex-direction: column;
            gap: 12px;
            min-width: 240px;
            opacity: 0;
            transform: translateY(8px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .voxcraft-visualizer.show {
            display: flex;
            opacity: 1;
            transform: translateY(0);
          }
          .voxcraft-status {
            font-size: 13px;
            font-weight: 500;
            color: \${isDark ? '#e5e7eb' : '#1f2937'};
            text-align: center;
          }
          .voxcraft-bars {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            height: 32px;
          }
          .voxcraft-bar {
            width: 4px;
            height: 8px;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            border-radius: 2px;
            animation: wave 1s ease-in-out infinite;
          }
          .voxcraft-bar:nth-child(2) { animation-delay: 0.1s; }
          .voxcraft-bar:nth-child(3) { animation-delay: 0.2s; }
          .voxcraft-bar:nth-child(4) { animation-delay: 0.3s; }
          .voxcraft-bar:nth-child(5) { animation-delay: 0.4s; }
          @keyframes wave {
            0%, 100% { height: 8px; }
            50% { height: 24px; }
          }
          
          .voxcraft-branding {
            position: fixed;
            \${BOT_CONFIG.position === 'bottom-left' ? 'left: 24px;' : 'right: 24px;'}
            bottom: 100px;
            background: \${isDark 
              ? 'rgba(30, 30, 46, 0.95)' 
              : 'rgba(255, 255, 255, 0.95)'};
            backdrop-filter: blur(10px);
            border: 1px solid \${isDark 
              ? 'rgba(255, 255, 255, 0.1)' 
              : 'rgba(0, 0, 0, 0.1)'};
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 11px;
            font-weight: 500;
            color: \${isDark ? '#9ca3af' : '#6b7280'};
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            z-index: 999998;
            transition: all 0.3s ease;
          }
          
          .voxcraft-branding-link {
            color: \${isDark ? '#60a5fa' : '#3b82f6'};
            text-decoration: none;
            font-weight: 600;
            transition: color 0.2s ease;
          }
          
          .voxcraft-branding-link:hover {
            color: \${isDark ? '#93c5fd' : '#2563eb'};
            text-decoration: underline;
          }
        </style>
        
        <button class="voxcraft-widget-btn" id="voxcraft-btn" aria-label="Voice Assistant">
          <svg class="voxcraft-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>
        
        <div class="voxcraft-visualizer" id="voxcraft-visualizer">
          <div class="voxcraft-status" id="voxcraft-status">Ready to assist</div>
          <div class="voxcraft-bars">
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
          </div>
        </div>
      \`;

      widget.innerHTML = widgetHTML;
      document.body.appendChild(widget);
      
      // Create and append branding
      const branding = document.createElement('div');
      branding.className = 'voxcraft-branding';
      branding.innerHTML = \`
        Powered by <a href="https://anvevoice.app/" 
                       target="_blank" 
                       rel="noopener noreferrer" 
                       class="voxcraft-branding-link">AnveVoice</a>
      \`;
      document.body.appendChild(branding);

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
        this.updateWidgetState('active', 'Connecting...');
        this.visualizer.classList.add('show');
        
        // Trigger the hidden default widget to start the call
        const hiddenBtn = document.querySelector('.vapi-btn');
        if (hiddenBtn) {
          hiddenBtn.click();
        }
        
        this.isCallActive = true;
        this.updateWidgetState('listening', 'Listening...');
      } catch (error) {
        console.error('Start call failed:', error);
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

    // Enhanced call ID extraction with multiple attempts and progressive delays
    attemptCallIdExtraction(attempt = 0) {
      const maxAttempts = 8;
      const delays = [100, 200, 500, 800, 1200, 1800, 2500, 3500]; // Progressive delays
      
      console.log('🔍 Attempting call ID extraction (attempt ' + (attempt + 1) + '/' + maxAttempts + ')');
      
      try {
        // Multiple extraction strategies
        const vapiCallId = 
          this.vapiWidget?.callId ||
          this.vapiWidget?._callId ||
          this.vapiWidget?.call?.id ||
          this.vapiWidget?.activeCall?.id ||
          this.vapiWidget?.currentCall?.id ||
          this.vapiWidget?.session?.callId ||
          this.vapiWidget?.webCall?.id;
          
        if (vapiCallId) {
          console.log('🎯 Call ID extracted successfully:', vapiCallId);
          this.currentCallId = vapiCallId;
          
          // Clean up discovery channel since we have the call ID
          if (this.discoveryChannel) {
            this.discoveryChannel.unsubscribe();
            this.discoveryChannel = null;
          }
          
          // Register session mapping IMMEDIATELY
          this.registerSessionMapping(vapiCallId);
          
          // Subscribe to BOTH channels for grace period
          this.subscribeToCallChannelWithFallback(vapiCallId);
          this.updateStatus('🔗 Session isolated - ready for commands!');
          return;
        }
        
        // If not found and we have more attempts, try again with progressive delay
        if (attempt < maxAttempts - 1) {
          setTimeout(() => {
            this.attemptCallIdExtraction(attempt + 1);
          }, delays[attempt]);
        } else {
          console.warn('⚠️ Could not extract callId after', maxAttempts, 'attempts, relying on backend discovery');
          this.updateStatus('🟡 Waiting for session discovery...');
        }
        
      } catch (error) {
        console.error('❌ Error in call ID extraction attempt', attempt + 1, ':', error);
        
        // Try again if we have attempts left
        if (attempt < maxAttempts - 1) {
          setTimeout(() => {
            this.attemptCallIdExtraction(attempt + 1);
          }, delays[attempt]);
        }
      }
    }

    setupVapiEventListeners() {
      // Call started - Extract callId immediately from Vapi SDK
      this.vapiWidget.on("call-start", (event) => {
        console.log('📞 VAPI call started');
        this.updateStatus("🎤 Voice active - setting up session...");
        this.updateWidgetState('listening', 'Listening...');
        
        // ENHANCED: Multi-attempt call ID extraction with progressive delays
        this.attemptCallIdExtraction(0);
      });

      // Call ended - Clean up session
      this.vapiWidget.on("call-end", () => {
        console.log('📞 VAPI call ended');
        this.currentCallId = null;
        this.isCallActive = false;
        
        if (this.realtimeChannel) {
          this.realtimeChannel.unsubscribe();
          this.realtimeChannel = null;
        }
        
        if (this.discoveryChannel) {
          this.discoveryChannel.unsubscribe();
          this.discoveryChannel = null;
        }
        
        if (this.mappingChannel) {
          this.mappingChannel.unsubscribe();
          this.mappingChannel = null;
        }
        
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
          default:
            console.warn('Unknown function call:', functionName);
            this.updateStatus(\`❓ Unknown command: \${functionName}\`);
        }
        this.updateStatus(\`✅ Executed \${functionName}\`);
      } catch (error) {
        console.error('❌ Function execution error:', error);
        this.updateStatus(\`❌ Error executing \${functionName}\`);
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
          this.updateStatus(\`📜 Scrolled to \${target_section}\`);
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
              this.updateStatus(\`📜 Scrolled to \${direction}\`);
              return;
            }
          }
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
      }
      
      this.updateStatus(\`📜 Scrolled \${direction || 'down'}\`);
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
      const { target_text, element_type, nth_match } = params;
      console.log('🖱️ Finding element to click:', target_text, element_type, nth_match);
      
      // Try multiple strategies to find the element
      let element = this.findElementByText(target_text);
      
      // If not found, try more aggressive search
      if (!element) {
        element = this.findElementByFuzzyMatch(target_text, element_type);
      }
      
      // If still not found, try by partial match
      if (!element) {
        element = this.findElementByPartialMatch(target_text, nth_match || 0);
      }
      
      if (element) {
        this.performClick(element);
        this.updateStatus(\`✅ Clicked: \${target_text}\`);
      } else {
        // Try to provide helpful feedback
        const suggestions = this.getSimilarElements(target_text);
        if (suggestions.length > 0) {
          console.log('🔍 Similar elements found:', suggestions.map(s => s.text));
          this.updateStatus(\`❌ Not found. Try: \${suggestions[0].text}\`);
        } else {
          this.updateStatus(\`❌ Element not found: \${target_text}\`);
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
        
        // Wait for scroll to complete
        setTimeout(() => {
          // Try multiple click strategies
          element.focus();
          
          // Dispatch mouse events for better compatibility
          const mouseEvents = ['mousedown', 'mouseup', 'click'];
          mouseEvents.forEach(eventType => {
            const event = new MouseEvent(eventType, {
              view: window,
              bubbles: true,
              cancelable: true,
              buttons: 1
            });
            element.dispatchEvent(event);
          });
          
          // Also try native click
          element.click();
          
          // Handle special cases
          if (element.tagName === 'A' && element.href) {
            // For links that might use preventDefault
            const clickEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true,
              ctrlKey: false,
              metaKey: false
            });
            
            if (!element.dispatchEvent(clickEvent)) {
              // If prevented, try navigation
              if (element.href && !element.href.startsWith('javascript:')) {
                window.location.href = element.href;
              }
            }
          }
          
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
                if (new RegExp(\`\\\\b\${term}\\\\b\`).test(elementText)) {
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
        
        this.updateStatus(\`✅ Filled field: \${value}\`);
        
        // Auto-submit if requested
        if (submit_after) {
          setTimeout(() => {
            this.submitForm(field);
          }, 500);
        }
      } else {
        this.updateStatus(\`❌ Field not found: \${field_hint || 'any'}\`);
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
          this.updateStatus(\`✅ Toggled: \${target}\`);
        } else {
          this.updateStatus(\`⚠️ Toggle may not have worked: \${target}\`);
        }
      } else {
        this.updateStatus(\`❌ Toggle element not found: \${target}\`);
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
        const label = document.querySelector(\`label[for="\${element.id}"]\`);
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
      if (this.discoveryChannel) {
        this.discoveryChannel.unsubscribe();
      }
      if (this.mappingChannel) {
        this.mappingChannel.unsubscribe();
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