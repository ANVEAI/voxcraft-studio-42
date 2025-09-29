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
      this.isInitialized = false;
      this.currentPageElements = [];
      this.statusEl = null;
      this.assistantId = null;
      
      this.init();
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
        this.currentSessionId = null;
        this.currentCallId = null;
        // Listen only to assistant-specific channel initially; session channel will be added on call-start
        const channels = [
          \`vapi:assistant:\${this.assistantId}\`
        ];

        this.channels = [];
        
        // Subscribe to all channels
        channels.forEach(channelName => {
          const channel = this.supabaseClient
            .channel(channelName)
            .on('broadcast', { event: 'function_call' }, (payload) => {
              console.log(\`📡 Received function call on \${channelName}:\`, payload);
              console.log('📊 Function call payload structure:', {
                hasPayload: !!payload.payload,
                payloadKeys: payload.payload ? Object.keys(payload.payload) : 'none',
                assistantId: payload.payload?.assistantId,
                callId: payload.payload?.callId,
                sessionId: payload.payload?.sessionId
              });
              
              // Filter by assistant ID if available
              if (!payload.payload.assistantId || payload.payload.assistantId === this.assistantId) {
                console.log('✅ Function call accepted - executing...');
                this.executeFunctionCall(payload.payload);
              } else {
                console.log('🚫 Function call rejected - wrong assistant ID:', {
                  received: payload.payload.assistantId,
                  expected: this.assistantId
                });
              }
            })
            .subscribe((status) => {
              console.log(\`Realtime status for \${channelName}:\`, status);
              if (status === 'SUBSCRIBED') {
                this.updateStatus('🟢 Connected to voice control');
              }
            });
            
          this.channels.push(channel);
        });

        // Also listen for session-specific channels when VAPI calls start
        this.setupDynamicChannelSubscription();

        console.log('✅ Supabase Realtime setup complete for channels:', channels);
        
      } catch (error) {
        console.error('❌ Supabase Realtime setup failed:', error);
        this.updateStatus("❌ Command listener failed");
      }
    }

    setupDynamicChannelSubscription() {
      // Listen for VAPI events to get call/session ID
      if (this.vapiWidget) {
        this.vapiWidget.on("call-start", (event) => {
          console.log('📞 VAPI call started with event:', event);
          
          // Extract call ID from event if available
          const callId = event?.callId || event?.id || event?.call?.id;
          if (callId) {
            const sessionChannelName = \`vapi:session:call_\${callId}\`;
            console.log('🔗 Subscribing to session channel:', sessionChannelName);
            
            const sessionChannel = this.supabaseClient
              .channel(sessionChannelName)
              .on('broadcast', { event: 'function_call' }, (payload) => {
                console.log(\`📡 Received session function call on \${sessionChannelName}:\`, payload);
                this.executeFunctionCall(payload.payload);
              })
              .subscribe((status) => {
                console.log(\`Session channel \${sessionChannelName} status:\`, status);
              });
              
            this.channels.push(sessionChannel);
          }
        });
      }
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
          config: config
        });

        this.setupVapiEventListeners();
        this.isInitialized = true;
        this.updateStatus("🎤 Click to start voice control!");
        
      } catch (error) {
        console.error('Vapi initialization error:', error);
        this.updateStatus("❌ Voice setup failed");
      }
    }

    setupVapiEventListeners() {
      // Call started - Enhanced with comprehensive call ID discovery
      this.vapiWidget.on("call-start", (event) => {
        console.log('📞 VAPI call-start event received');
        console.log('📊 Full event object:', JSON.stringify(event, null, 2));
        console.log('📊 Event type:', typeof event);
        console.log('📊 Event keys:', event ? Object.keys(event) : 'null/undefined');
        this.updateStatus("🎤 Voice active - VAPI handling all processing");
        
        // Multiple extraction strategies for call ID discovery
        const extractCallId = (eventData) => {
          if (!eventData) return null;
          
          // Strategy 1: Direct properties
          const directId = eventData.callId || eventData.id || eventData.call?.id || eventData.call?.callId;
          if (directId) {
            console.log('✅ Call ID found via direct properties:', directId);
            return directId;
          }
          
          // Strategy 2: Nested object exploration
          const searchNested = (obj, depth = 0) => {
            if (depth > 3 || !obj || typeof obj !== 'object') return null;
            
            for (const key of Object.keys(obj)) {
              if (key.toLowerCase().includes('call') && typeof obj[key] === 'string') {
                console.log(\`✅ Call ID found via nested search (\${key}):\`, obj[key]);
                return obj[key];
              }
              if (typeof obj[key] === 'object') {
                const nested = searchNested(obj[key], depth + 1);
                if (nested) return nested;
              }
            }
            return null;
          };
          
          return searchNested(eventData);
        };
        
        const callId = extractCallId(event);
        this.attemptSessionSetup(callId, 'call-start');
      });

      // Enhanced discovery via other VAPI events
      this.vapiWidget.on("call-end", (event) => {
        console.log('📞 VAPI call ended');
        console.log('📊 Call-end event:', JSON.stringify(event, null, 2));
        this.updateStatus("🔄 Voice ended");
        this.cleanupSessionChannels();
      });

      // Try to capture call ID from speech events
      this.vapiWidget.on("speech-start", (event) => {
        console.log('🤖 Assistant speaking');
        console.log('📊 Speech-start event:', JSON.stringify(event, null, 2));
        this.updateStatus("🤖 Assistant responding...");
        
        if (!this.currentCallId) {
          const callId = this.extractCallIdFromEvent(event);
          this.attemptSessionSetup(callId, 'speech-start');
        }
      });

      this.vapiWidget.on("speech-end", (event) => {
        console.log('🤖 Assistant finished');
        console.log('📊 Speech-end event:', JSON.stringify(event, null, 2));
        this.updateStatus("🎤 Ready for commands");
        
        if (!this.currentCallId) {
          const callId = this.extractCallIdFromEvent(event);
          this.attemptSessionSetup(callId, 'speech-end');
        }
      });

      // Capture any other VAPI events that might contain call info
      this.vapiWidget.on("message", (event) => {
        console.log('📨 VAPI message event:', JSON.stringify(event, null, 2));
        
        if (!this.currentCallId) {
          const callId = this.extractCallIdFromEvent(event);
          this.attemptSessionSetup(callId, 'message');
        }
      });

      // Error handling
      this.vapiWidget.on("error", (error) => {
        console.error('❌ VAPI error:', error);
        this.updateStatus("❌ Voice error");
      });
    }

    // Helper method to extract call ID from any event
    extractCallIdFromEvent(event) {
      if (!event) return null;
      
      // Check common call ID locations
      const possiblePaths = [
        event.callId,
        event.id,
        event.call?.id,
        event.call?.callId,
        event.data?.callId,
        event.data?.id,
        event.payload?.callId,
        event.payload?.id
      ];
      
      for (const path of possiblePaths) {
        if (path && typeof path === 'string') {
          console.log('✅ Call ID extracted from event:', path);
          return path;
        }
      }
      
      return null;
    }

    // Enhanced session setup with fallback handling
    attemptSessionSetup(callId, source) {
      if (!callId) {
        console.log(\`⏭️ No call ID from \${source}, will try function call fallback\`);
        return;
      }
      
      if (this.currentCallId === callId) {
        console.log(\`✅ Call ID already set: \${callId}\`);
        return;
      }
      
      console.log(\`🔗 Setting up session from \${source} with call ID:\`, callId);
      this.currentCallId = callId;
      this.currentSessionId = \`call_\${callId}\`;
      
      const sessionChannelName = \`vapi:session:\${this.currentSessionId}\`;
      
      // Check if we're already subscribed to this session channel
      if (this.sessionChannelName === sessionChannelName) {
        console.log('✅ Already subscribed to session channel:', sessionChannelName);
        return;
      }
      
      this.sessionChannelName = sessionChannelName;
      console.log('🎯 Subscribing to session channel:', sessionChannelName);
      
      try {
        const sessionChannel = this.supabaseClient
          .channel(sessionChannelName)
          .on('broadcast', { event: 'function_call' }, (payload) => {
            console.log(\`📡 Received session function call on \${sessionChannelName}:\`, payload);
            this.executeFunctionCall(payload.payload);
          })
          .subscribe((status) => {
            console.log(\`📊 Session channel \${sessionChannelName} status:\`, status);
            if (status === 'SUBSCRIBED') {
              this.updateStatus('🔗 Session channel ready');
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Session channel subscription failed');
              this.updateStatus('⚠️ Session channel failed');
            }
          });
          
        this.channels.push(sessionChannel);
        console.log('✅ Session channel subscription initiated');
        
      } catch (error) {
        console.error('❌ Session channel setup error:', error);
        this.updateStatus('❌ Session setup failed');
      }
    }

    // Enhanced cleanup
    cleanupSessionChannels() {
      console.log('🧹 Cleaning up session channels...');
      if (this.channels) {
        this.channels.forEach(channel => {
          try {
            this.supabaseClient.removeChannel(channel);
            console.log('✅ Channel removed:', channel.topic);
          } catch (e) {
            console.warn('⚠️ Channel cleanup warning:', e);
          }
        });
      }
      this.currentCallId = null;
      this.currentSessionId = null;
      this.sessionChannelName = null;
    }

    // Core function call executor - receives commands from VAPI via webhook -> Supabase Realtime
    executeFunctionCall(functionCall) {
      const { functionName, params, sessionId, callId, debug } = functionCall;
      console.log('⚡ Executing function call:', { functionName, params, sessionId, callId, debug });
      
      // **ENHANCED FALLBACK STRATEGY**: Use function call data to discover session if not set
      const incomingCallId = callId;
      const incomingSession = (sessionId && sessionId !== '{{sessionId}}') ? sessionId : (callId ? \`call_\${callId}\` : null);
      
      // If we don't have a current session, try to establish one from function call data
      if (!this.currentSessionId && incomingCallId) {
        console.log('🔍 No current session, attempting discovery from function call...');
        console.log('📊 Function call discovery data:', { callId: incomingCallId, sessionId, incomingSession });
        
        // Set up session from function call data
        this.currentCallId = incomingCallId;
        this.currentSessionId = incomingSession || \`call_\${incomingCallId}\`;
        this.sessionChannelName = \`vapi:session:\${this.currentSessionId}\`;
        
        console.log('✅ Session discovered via function call:', this.currentSessionId);
        
        // Subscribe to the session channel now that we have the call ID
        this.attemptSessionSetup(incomingCallId, 'function-call-fallback');
      }
      
      // Enhanced session isolation guard
      if (this.currentSessionId && incomingSession && incomingSession !== this.currentSessionId) {
        console.warn('🚫 Ignoring function call for different session', { 
          incomingSession, 
          currentSession: this.currentSessionId,
          incomingCallId,
          currentCallId: this.currentCallId
        });
        return;
      }
      
      // Log successful session match
      if (this.currentSessionId && incomingSession === this.currentSessionId) {
        console.log('✅ Function call session match confirmed:', this.currentSessionId);
      }
      
      // Add visual feedback for debugging
      this.updateStatus(\`🔧 Executing: \${functionName}\`);
      
      try {
        // Log the DOM manipulation attempt
        console.log(\`🎯 DOM Action: \${functionName} with params:\`, params);
        
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
            return;
        }
        
        // Success feedback
        this.updateStatus(\`✅ \${functionName} completed\`);
        console.log(\`✅ Successfully executed \${functionName}\`);
        
      } catch (error) {
        console.error('❌ Function execution error:', error);
        this.updateStatus(\`❌ Error: \${functionName}\`);
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