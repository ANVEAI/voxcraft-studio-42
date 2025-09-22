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

  const jsContent = `// VAPI-Centric Voice Automation Embed Script
// Handles DOM command execution via VAPI function calls
(function() {
  'use strict';
  
  // Configuration - Replace with your bot credentials
  const BOT_CONFIG = {
    assistantId: "NEW_ASSISTANT_ID_PLACEHOLDER", // Replace with your assistant ID
    apiKey: "NEW_PUBLIC_KEY_PLACEHOLDER",        // Replace with your API key
    position: "bottom-right",
    theme: "light"
  };

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
        // Import Supabase client
        const { createClient } = await import('https://cdn.skypack.dev/@supabase/supabase-js');
        
        this.supabaseClient = createClient(
          'https://mdkcdjltvfpthqudhhmx.supabase.co',
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NDU3NTAsImV4cCI6MjA2OTUyMTc1MH0.YJAf_8-6tKTXp00h7liGNLvYC_-vJ4ttonAxP3ySvOg'
        );

        // Get assistant ID from bot config
        this.assistantId = BOT_CONFIG.assistantId;
        
        // Subscribe to function call events for this specific bot
        this.realtimeChannel = this.supabaseClient
          .channel(\`bot_\${this.assistantId}\`)
          .on('broadcast', { event: 'function_call' }, (payload) => {
            console.log('📡 Received function call:', payload);
            this.executeFunctionCall(payload.payload);
          })
          .subscribe();

        console.log('✅ Supabase Realtime connected for bot:', this.assistantId);
        this.updateStatus("🔗 Command listener active");
        
      } catch (error) {
        console.error('❌ Supabase Realtime setup failed:', error);
        this.updateStatus("❌ Command listener failed");
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
      // Call started
      this.vapiWidget.on("call-start", () => {
        console.log('📞 VAPI call started');
        this.updateStatus("🎤 Voice active - VAPI handling all processing");
      });

      // Call ended
      this.vapiWidget.on("call-end", () => {
        console.log('📞 VAPI call ended');
        this.updateStatus("🔄 Voice ended");
      });

      // Assistant speaking
      this.vapiWidget.on("speech-start", () => {
        console.log('🤖 Assistant speaking');
        this.updateStatus("🤖 Assistant responding...");
      });

      this.vapiWidget.on("speech-end", () => {
        console.log('🤖 Assistant finished');
        this.updateStatus("🎤 Ready for commands");
      });

      // Error handling
      this.vapiWidget.on("error", (error) => {
        console.error('❌ VAPI error:', error);
        this.updateStatus("❌ Voice error");
      });
    }

    // Core function call executor - receives commands from VAPI via webhook -> Supabase Realtime
    executeFunctionCall(functionCall) {
      const { functionName, parameters } = functionCall;
      console.log('⚡ Executing function call:', functionName, parameters);
      
      try {
        switch (functionName) {
          case 'scroll_page':
            this.scroll_page(parameters);
            break;
          case 'click_element':
            this.click_element(parameters);
            break;
          case 'fill_field':
            this.fill_field(parameters);
            break;
          case 'toggle_element':
            this.toggle_element(parameters);
            break;
          default:
            console.warn('Unknown function call:', functionName);
            this.updateStatus(\`❓ Unknown command: \${functionName}\`);
        }
      } catch (error) {
        console.error('❌ Function execution error:', error);
        this.updateStatus(\`❌ Error executing \${functionName}\`);
      }
    }

    // DOM manipulation functions - these contain all the DOM logic
    
    scroll_page(params) {
      const { direction } = params;
      console.log('📜 Scrolling page:', direction);
      
      const scrollAmount = window.innerHeight * 0.8;
      
      switch(direction) {
        case 'down':
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
          break;
        case 'up':
          window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
          break;
        case 'top':
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'bottom':
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          break;
      }
      
      this.updateStatus(\`📜 Scrolled \${direction}\`);
    }

    click_element(params) {
      const { target_text } = params;
      console.log('🖱️ Finding element to click:', target_text);
      
      const element = this.findElementByText(target_text);
      if (element) {
        this.clickElement(element);
        this.updateStatus(\`✅ Clicked: \${target_text}\`);
      } else {
        this.updateStatus(\`❌ Element not found: \${target_text}\`);
      }
    }

    fill_field(params) {
      const { value, field_hint } = params;
      console.log('✏️ Filling field:', value, field_hint);
      
      // Find form field based on hint or proximity
      const field = this.findFieldByHint(field_hint || value);
      if (field) {
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        this.updateStatus(\`✅ Filled field: \${value}\`);
      } else {
        this.updateStatus(\`❌ Field not found\`);
      }
    }

    toggle_element(params) {
      const { target } = params;
      console.log('🔄 Toggling element:', target);
      
      const element = this.findElementByText(target);
      if (element) {
        // Try different toggle strategies
        if (element.type === 'checkbox' || element.type === 'radio') {
          element.checked = !element.checked;
        } else if (element.classList.contains('active')) {
          element.classList.remove('active');
        } else {
          element.classList.add('active');
        }
        
        element.click(); // Also trigger click for additional behaviors
        this.updateStatus(\`✅ Toggled: \${target}\`);
      } else {
        this.updateStatus(\`❌ Element not found: \${target}\`);
      }
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