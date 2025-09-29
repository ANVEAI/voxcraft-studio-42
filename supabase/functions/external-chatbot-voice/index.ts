import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the origin from the request to use in the JavaScript
    const origin = new URL(req.url).origin;
    
    const jsContent = `// Universal Voice Navigation Embed Script - Simplified & Fixed
// Add this script to any website to enable voice navigation
(function() {
  'use strict';
  
  // Configuration - Replace with your Vapi credentials
  const VAPI_CONFIG = {
    assistant: "NEW_ASSISTANT_ID_PLACEHOLDER", // Replace with your assistant ID
    apiKey: "NEW_PUBLIC_KEY_PLACEHOLDER",     // Replace with your API key
    position: "bottom-right",
    theme: "light",
    mode: "voice"
  };

  class UniversalVoiceNavigator {
    constructor() {
      this.vapiWidget = null;
      this.isInitialized = false;
      this.currentPageElements = [];
      this.statusEl = null;
      this.navigationInProgress = false;
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 3;
      
      // Simple speech tracking
      this.callActive = false;
      this.assistantSpeaking = false;
      this.lastProcessedTranscript = '';
      
      // Session persistence
      this.sessionId = 'voice_' + Date.now();
      
      this.init();
    }

    init() {
      console.log('🎤 Initializing Universal Voice Navigator...');
      this.createStatusIndicator();
      this.updateStatus("Loading voice navigation...");
      this.loadVapiSDK();
      this.analyzePageContent();
      this.setupNavigationHandling();
      
      // Check for session restoration
      setTimeout(() => {
        this.checkForSessionRestore();
      }, 1500);
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
        this.vapiWidget = window.vapiSDK.run({
          apiKey: VAPI_CONFIG.apiKey,
          assistant: VAPI_CONFIG.assistant,
          config: {
            position: VAPI_CONFIG.position,
            theme: VAPI_CONFIG.theme,
            mode: VAPI_CONFIG.mode
          }
        });

        this.setupVapiEventListeners();
        this.isInitialized = true;
        this.updateStatus("🎤 Click the voice button to start!");
        
      } catch (error) {
        console.error('Vapi initialization error:', error);
        this.updateStatus("❌ Voice setup failed");
      }
    }

    setupVapiEventListeners() {
      // Call started - voice is now active
      this.vapiWidget.on("call-start", () => {
        console.log('📞 Call started');
        this.callActive = true;
        this.assistantSpeaking = false;
        this.updateStatus("🎤 Voice active - say your command!");
        this.storeSession();
        this.reconnectAttempts = 0;
      });

      // Call ended - voice is no longer active
      this.vapiWidget.on("call-end", () => {
        console.log('📞 Call ended');
        this.callActive = false;
        this.assistantSpeaking = false;
        this.updateStatus("🔄 Voice ended");
        
        // Auto-reconnect if not navigating
        if (!this.navigationInProgress) {
          setTimeout(() => {
            this.attemptReconnect();
          }, 2000);
        } else {
          this.storeNavigationState();
        }
      });

      // Assistant started speaking
      this.vapiWidget.on("speech-start", () => {
        console.log('🤖 Assistant started speaking');
        this.assistantSpeaking = true;
        this.updateStatus("🤖 Assistant responding...");
      });

      // Assistant stopped speaking
      this.vapiWidget.on("speech-end", () => {
        console.log('🤖 Assistant finished speaking');
        this.assistantSpeaking = false;
        this.updateStatus("🎤 Ready for your command");
      });

      // Transcript received - this is the key event
      this.vapiWidget.on("message", (message) => {
        console.log('📨 Processing VAPI message:', message);
        
        // Process transcript messages
        if (message.type === "transcript") {
          // Process both partial and final transcripts to catch commands faster
          if (message.transcriptType === "final" || 
              (message.transcriptType === "partial" && message.transcript?.length > 5)) {
            this.handleTranscript(message);
          }
        }
      });

      // Error handling
      this.vapiWidget.on("error", (error) => {
        console.error('❌ Vapi error:', error);
        this.updateStatus("❌ Voice error");
        this.callActive = false;
        
        setTimeout(() => {
          this.attemptReconnect();
        }, 3000);
      });
    }

    handleTranscript(message) {
      const transcript = message.transcript?.trim();
      const role = message.role;
      
      if (!transcript || transcript.length < 3) {
        console.log('⚠️ Empty or too short transcript, ignoring');
        return;
      }

      console.log("📝 Transcript:", role + ":", transcript);
      
      // Only process USER transcripts for commands
      if (role !== 'user') {
        console.log('⚠️ Not a user transcript, ignoring');
        return;
      }

      // Simple duplicate check
      if (transcript === this.lastProcessedTranscript) {
        console.log('⚠️ Duplicate transcript, ignoring');
        return;
      }

      this.lastProcessedTranscript = transcript;
      
      // Only process if call is active
      if (!this.callActive) {
        console.log('⚠️ Call not active, ignoring transcript');
        return;
      }

      const lowerTranscript = transcript.toLowerCase();
      
      // Process as user command immediately
      console.log('🎤 Processing voice command:', transcript);
      this.updateStatus("👤 Processing: \"" + transcript + "\"");
      this.processCommand(lowerTranscript, transcript);
    }

    processCommand(lowerTranscript, originalTranscript) {
      console.log('🎤 Processing voice command:', lowerTranscript);

      // Direct command matching - simple and reliable
      const commands = {
        // Navigation commands
        'home': () => this.navigateTo(['home', 'homepage']),
        'go home': () => this.navigateTo(['home', 'homepage']),
        'take me home': () => this.navigateTo(['home', 'homepage']),
        'about': () => this.navigateTo(['about', 'about us']),
        'go to about': () => this.navigateTo(['about', 'about us']),
        'contact': () => this.navigateTo(['contact', 'contact us']),
        'open contact': () => this.navigateTo(['contact', 'contact us']),
        'click on contact': () => this.navigateTo(['contact', 'contact us']),
        'contact us': () => this.navigateTo(['contact', 'contact us']),
        'services': () => this.navigateTo(['services', 'our services']),
        'products': () => this.navigateTo(['products', 'shop', 'store']),
        'blog': () => this.navigateTo(['blog', 'articles', 'news']),
        'login': () => this.navigateTo(['login', 'sign in', 'log in']),
        'sign in': () => this.navigateTo(['login', 'sign in', 'log in']),
        'register': () => this.navigateTo(['register', 'sign up', 'join']),
        'sign up': () => this.navigateTo(['register', 'sign up', 'join']),
        
        // Scrolling commands
        'scroll down': () => this.scrollPage('down'),
        'page down': () => this.scrollPage('down'),
        'scroll up': () => this.scrollPage('up'),
        'page up': () => this.scrollPage('up'),
        'top': () => this.scrollPage('top'),
        'go to top': () => this.scrollPage('top'),
        'scroll to top': () => this.scrollPage('top'),
        'bottom': () => this.scrollPage('bottom'),
        'go to bottom': () => this.scrollPage('bottom'),
        'scroll to bottom': () => this.scrollPage('bottom'),
        
        // Utility commands
        'refresh': () => this.refreshPage(),
        'reload': () => this.refreshPage(),
        'help': () => this.showHelp(),
        'what can i do': () => this.showHelp(),
        'analyze page': () => this.analyzePage()
      };

      // Check for exact command matches first
      if (commands[lowerTranscript]) {
        console.log("✅ Executing exact command:", lowerTranscript);
        commands[lowerTranscript]();
        this.updateStatus("✅ Executed: " + originalTranscript);
        return true;
      }

      // Check for partial matches
      for (const [command, action] of Object.entries(commands)) {
        if (lowerTranscript.includes(command)) {
          console.log("✅ Executing partial match:", command, "in", lowerTranscript);
          action();
          this.updateStatus("✅ Executed: " + originalTranscript);
          return true;
        }
      }

      // Try fuzzy matching for page elements
      const element = this.findElementByVoice(lowerTranscript);
      if (element) {
        console.log("✅ Found element for:", lowerTranscript);
        this.clickElement(element);
        const elementText = this.getElementText(element);
        this.updateStatus("✅ Clicked: " + elementText);
        return true;
      }

      // Command not recognized
      console.log('❓ Command not recognized:', lowerTranscript);
      this.updateStatus("❓ Not recognized: \"" + originalTranscript + "\"");
      return false;
    }

    navigateTo(searchTerms) {
      console.log('🧭 Navigating to:', searchTerms);
      
      let bestElement = null;
      let bestScore = 0;
      
      this.currentPageElements.forEach(item => {
        const itemText = item.text.toLowerCase();
        const itemHref = (item.href || '').toLowerCase();
        
        searchTerms.forEach(term => {
          const termLower = term.toLowerCase();
          if (itemText.includes(termLower) || itemHref.includes(termLower)) {
            const score = termLower.length + (itemText === termLower ? 10 : 0);
            if (score > bestScore) {
              bestScore = score;
              bestElement = item.element;
            }
          }
        });
      });

      if (bestElement) {
        this.clickElement(bestElement);
        return true;
      } else {
        console.log('❌ Navigation target not found:', searchTerms);
        this.updateStatus(\`❌ Could not find: \${searchTerms[0]}\`);
        return false;
      }
    }

    scrollPage(direction) {
      console.log('📜 Scrolling:', direction);
      
      try {
        const scrollAmount = window.innerHeight * 0.8;
        
        switch(direction) {
          case 'down':
            console.log('📜 Scrolling down by', scrollAmount, 'pixels');
            window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
            break;
          case 'up':
            console.log('📜 Scrolling up by', scrollAmount, 'pixels');
            window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
            break;
          case 'top':
            console.log('📜 Scrolling to top');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            break;
          case 'bottom':
            console.log('📜 Scrolling to bottom');
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            break;
        }
        
        this.updateStatus("📜 Scrolled " + direction);
        console.log("✅ Successfully scrolled " + direction);
        return true;
      } catch (error) {
        console.error('❌ Scroll failed:', error);
        this.updateStatus("❌ Scroll failed: " + direction);
        return false;
      }
    }

    findElementByVoice(transcript) {
      const words = transcript.split(' ').filter(word => word.length > 2);
      let bestElement = null;
      let bestScore = 0;
      
      this.currentPageElements.forEach(item => {
        const searchText = (item.text + ' ' + item.href).toLowerCase();
        let score = 0;
        
        words.forEach(word => {
          if (searchText.includes(word)) {
            score += word.length;
            // Bonus for exact word matches
            if (item.text.toLowerCase().split(' ').includes(word)) {
              score += 5;
            }
          }
        });
        
        if (score > bestScore && score > 4) { // Minimum threshold
          bestScore = score;
          bestElement = item.element;
        }
      });
      
      return bestElement;
    }

    clickElement(element) {
      try {
        console.log('🖱️ Clicking element:', this.getElementText(element));
        
        if (element.href && !element.href.startsWith('#') && !element.href.startsWith('javascript:')) {
          // This will cause navigation - store state first
          this.navigationInProgress = true;
          this.storeNavigationState();
        }
        
        // Scroll element into view first
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Wait a moment then click
        setTimeout(() => {
          element.focus();
          element.click();
          
          // Re-analyze page after click (for dynamic content)
          if (!this.navigationInProgress) {
            setTimeout(() => {
              this.analyzePageContent();
            }, 1000);
          }
        }, 300);
        
      } catch (error) {
        console.error('❌ Click failed:', error);
        this.updateStatus('❌ Click failed');
      }
    }

    analyzePageContent() {
      console.log('🔍 Analyzing page content...');
      this.currentPageElements = [];
      
      // Simple selector for interactive elements
      const selectors = [
        'a[href]:not([href^="#"]):not([href^="javascript:"]):not([href^="mailto:"]):not([href^="tel:"])',
        'button:not([disabled])',
        '[role="button"]:not([disabled])',
        'input[type="submit"]:not([disabled])',
        'input[type="button"]:not([disabled])',
        '.btn:not([disabled])',
        '.button:not([disabled])'
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
        return element.getAttribute('aria-label') ||
               element.textContent?.trim() ||
               element.value ||
               element.alt ||
               element.title ||
               element.placeholder ||
               '';
      } catch (e) {
        return '';
      }
    }

    refreshPage() {
      this.updateStatus('🔄 Refreshing page...');
      window.location.reload();
    }

    showHelp() {
      const commands = [
        'home, about, contact, services',
        'scroll up/down, go to top/bottom',
        'login, register, blog, products'
      ].join(' | ');
      
      this.updateStatus(\`ℹ️ Try: \${commands}\`);
    }

    analyzePage() {
      this.analyzePageContent();
      const count = this.currentPageElements.length;
      const sample = this.currentPageElements
        .slice(0, 5)
        .map(item => item.text)
        .join(', ');
      
      this.updateStatus(\`📊 \${count} elements: \${sample}\`);
    }

    // Session management
    storeSession() {
      try {
        const data = {
          sessionId: this.sessionId,
          timestamp: Date.now(),
          url: window.location.href,
          active: true
        };
        sessionStorage.setItem('voiceNavSession', JSON.stringify(data));
      } catch (e) {
        console.warn('Could not store session:', e);
      }
    }

    storeNavigationState() {
      try {
        const data = {
          sessionId: this.sessionId,
          timestamp: Date.now(),
          needsRestore: true,
          fromUrl: window.location.href
        };
        localStorage.setItem('voiceNavRestore', JSON.stringify(data));
      } catch (e) {
        console.warn('Could not store navigation state:', e);
      }
    }

    checkForSessionRestore() {
      try {
        const restoreData = localStorage.getItem('voiceNavRestore');
        if (restoreData) {
          const data = JSON.parse(restoreData);
          const age = Date.now() - data.timestamp;
          
          if (data.needsRestore && age < 60000) { // Within 1 minute
            console.log('🔄 Restoring voice session after navigation');
            this.updateStatus('🔄 Restoring voice session...');
            
            localStorage.removeItem('voiceNavRestore');
            
            setTimeout(() => {
              this.attemptReconnect();
            }, 2000);
          }
        }
      } catch (e) {
        console.warn('Could not check for session restore:', e);
      }
    }

    attemptReconnect() {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.updateStatus('❌ Max reconnection attempts reached');
        return;
      }

      this.reconnectAttempts++;
      console.log(\`🔄 Reconnection attempt \${this.reconnectAttempts}/\${this.maxReconnectAttempts}\`);
      this.updateStatus(\`🔄 Reconnecting... (\${this.reconnectAttempts}/\${this.maxReconnectAttempts})\`);

      try {
        // Simple reconnection - just reinitialize
        if (window.vapiSDK) {
          setTimeout(() => {
            this.initializeVapi();
          }, 1000);
        } else {
          this.loadVapiSDK();
        }
      } catch (error) {
        console.error('❌ Reconnection failed:', error);
        
        const delay = 2000 * this.reconnectAttempts;
        setTimeout(() => {
          this.attemptReconnect();
        }, delay);
      }
    }

    setupNavigationHandling() {
      // Page focus restoration
      window.addEventListener('focus', () => {
        if (this.isInitialized && !this.callActive) {
          setTimeout(() => {
            this.checkForSessionRestore();
          }, 500);
        }
      });

      // Page visibility restoration
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.isInitialized && !this.callActive) {
          setTimeout(() => {
            this.checkForSessionRestore();
          }, 1000);
        }
      });

      // Dynamic content changes
      if (window.MutationObserver) {
        const observer = new MutationObserver(() => {
          clearTimeout(this.analyzeTimeout);
          this.analyzeTimeout = setTimeout(() => {
            this.analyzePageContent();
          }, 2000);
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    }

    updateStatus(message) {
      if (this.statusEl) {
        this.statusEl.textContent = message;
      }
      console.log('🎤 Status:', message);
      
      // Auto-hide success messages
      if (message.startsWith('✅')) {
        setTimeout(() => {
          if (this.statusEl?.textContent === message) {
            this.updateStatus('🎤 Ready for commands');
          }
        }, 3000);
      }
    }
  }

  // Initialize
  function initVoiceNav() {
    if (window.voiceNav) {
      console.log('Voice Navigator already exists');
      return;
    }
    
    window.voiceNav = new UniversalVoiceNavigator();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVoiceNav);
  } else {
    initVoiceNav();
  }

  // Global interface
  window.VoiceNavigator = {
    refresh: () => window.voiceNav?.analyzePageContent(),
    reconnect: () => window.voiceNav?.attemptReconnect(),
    isActive: () => window.voiceNav?.callActive || false
  };

})();

  // Helper function to inject CSS for fixed positioning
  function injectFixedPositionCSS() {
    // Inject CSS to ensure fixed positioning works regardless of external styles
    if (!document.getElementById('vapi-fixed-position-css')) {
      const style = document.createElement('style');
      style.id = 'vapi-fixed-position-css';
      style.textContent = \`
        #vapi-voice-bot-container {
          position: fixed !important;
          bottom: 20px !important;
          \${position === 'right' ? 'right: 20px !important;' : 'left: 20px !important;'}
          top: auto !important;
          z-index: 2147483647 !important;
          pointer-events: auto !important;
          transform: none !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          outline: none !important;
          box-sizing: border-box !important;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          width: auto !important;
          height: auto !important;
          max-width: none !important;
          max-height: none !important;
          min-width: 0 !important;
          min-height: 0 !important;
          float: none !important;
          clear: none !important;
          overflow: visible !important;
        }
        
        #vapi-bot-widget {
          pointer-events: auto !important;
        }
        
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      \`;
      document.head.appendChild(style);
    }
  }

  function createVoiceWidget() {
    // Remove any existing widget
    const existingWidget = document.getElementById('vapi-voice-bot-container');
    if (existingWidget) {
      existingWidget.remove();
    }

    // Inject CSS to ensure fixed positioning works
    injectFixedPositionCSS();

    // Create active voice bot widget
    const container = document.createElement('div');
    container.id = 'vapi-voice-bot-container';
    container.style.cssText = \`
      position: fixed !important;
      \${position === 'right' ? 'right: 20px !important;' : 'left: 20px !important;'}
      bottom: 20px !important;
      top: auto !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      transform: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      outline: none !important;
      box-sizing: border-box !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      width: auto !important;
      height: auto !important;
    \`;

    const widget = document.createElement('div');
    widget.id = 'vapi-bot-widget';
    widget.style.cssText = \`
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      border: 3px solid #fff;
      position: relative;
      z-index: 1;
      pointer-events: auto !important;
    \`;
    
    widget.innerHTML = \`
      <svg width="24" height="24" fill="white" viewBox="0 0 24 24">
        <path d="M12 1a11 11 0 0 0-11 11v6a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6a7 7 0 0 1 14 0v6a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6a11 11 0 0 0-11-11zm0 7a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0v-8a3 3 0 0 0-3-3z"/>
      </svg>
    \`;

    container.appendChild(widget);
    document.body.appendChild(container);
    
    console.log('✅ Voice bot widget created and added to page');

    // Add click handler for voice activation
    widget.addEventListener('click', activateVoiceBot);
    
    // Add hover effects
    widget.addEventListener('mouseenter', () => {
      widget.style.transform = 'scale(1.1)';
      widget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
    });
    
    widget.addEventListener('mouseleave', () => {
      widget.style.transform = 'scale(1)';
      widget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    });
  }
  
  function createPendingWidget() {
    // Remove any existing widget
    const existingWidget = document.getElementById('vapi-voice-bot-container');
    if (existingWidget) {
      existingWidget.remove();
    }

    // Inject CSS to ensure fixed positioning works
    injectFixedPositionCSS();

    // Create pending activation widget
    const container = document.createElement('div');
    container.id = 'vapi-voice-bot-container';
    container.style.cssText = \`
      position: fixed !important;
      \${position === 'right' ? 'right: 20px !important;' : 'left: 20px !important;'}
      bottom: 20px !important;
      top: auto !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    \`;

    const widget = document.createElement('div');
    widget.id = 'vapi-bot-widget';
    widget.style.cssText = \`
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #ffa726 0%, #ff7043 100%);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      border: 3px solid #fff;
      opacity: 0.7;
      position: relative;
      z-index: 1;
    \`;
    
    widget.innerHTML = '<svg width="24" height="24" fill="white" viewBox="0 0 24 24">' +
      '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>' +
      '</svg>';

    container.appendChild(widget);
    document.body.appendChild(container);

    // Add hover effects for pending widget
    widget.addEventListener('click', () => {
      alert('Your voice bot is being activated and will be ready within 24 hours. Thank you for your patience!');
    });
  }

  // Enhanced Navigation command handling
  function handleNavigationCommand(message) {
    if (message.type === 'function-call') {
      const { name, parameters } = message.functionCall;
      console.log('🧭 Navigation command received:', name, parameters);
      
      switch (name) {
        case 'scroll_page':
          handleScrollPage(parameters);
          break;
          
        case 'navigate_to_url':
        case 'open_website':
          handleNavigateToUrl(parameters);
          break;
          
        case 'click_element':
          handleClickElement(parameters);
          break;
          
        case 'find_element':
          handleFindElement(parameters);
          break;
          
        case 'get_page_info':
          handleGetPageInfo(parameters);
          break;
          
        case 'go_back':
          handleGoBack();
          break;
          
        case 'go_forward':
          handleGoForward();
          break;
          
        case 'refresh_page':
          handleRefreshPage();
          break;
          
        case 'scroll_to_element':
          handleScrollToElement(parameters);
          break;
          
        case 'type_text':
          handleTypeText(parameters);
          break;
          
        default:
          console.log('Unknown navigation command:', name);
      }
    }
  }

  // Navigation function implementations
  function handleScrollPage(params) {
    const { direction, amount } = params;
    
    if (direction === 'up') {
      window.scrollBy({ top: -(amount || 300), behavior: 'smooth' });
    } else if (direction === 'down') {
      window.scrollBy({ top: (amount || 300), behavior: 'smooth' });
    } else if (direction === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (direction === 'bottom') {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } else if (amount) {
      window.scrollBy({ top: amount, behavior: 'smooth' });
    }
    
    console.log('✅ Scrolled page ' + direction + ' by ' + (amount || 300) + 'px');
  }

  function handleNavigateToUrl(params) {
    let { url, newTab } = params;
    
    // Knowledge base of common URLs - normalize and add protocol if needed
    const urlMap = {
      'google': 'https://www.google.com',
      'youtube': 'https://www.youtube.com',
      'facebook': 'https://www.facebook.com',
      'twitter': 'https://www.twitter.com',
      'x': 'https://www.x.com',
      'instagram': 'https://www.instagram.com',
      'linkedin': 'https://www.linkedin.com',
      'amazon': 'https://www.amazon.com',
      'netflix': 'https://www.netflix.com',
      'github': 'https://www.github.com',
      'stackoverflow': 'https://www.stackoverflow.com',
      'reddit': 'https://www.reddit.com',
      'wikipedia': 'https://www.wikipedia.org',
      'gmail': 'https://mail.google.com',
      'maps': 'https://maps.google.com',
      'drive': 'https://drive.google.com',
      'docs': 'https://docs.google.com',
      'discord': 'https://discord.com',
      'slack': 'https://slack.com',
      'zoom': 'https://zoom.us',
      'whatsapp': 'https://web.whatsapp.com',
      'telegram': 'https://web.telegram.org'
    };
    
    try {
      // If URL is not a full URL, try to find it in knowledge base
      if (url && !url.startsWith('http')) {
        const lowerUrl = url.toLowerCase().replace(/\s+/g, '');
        if (urlMap[lowerUrl]) {
          url = urlMap[lowerUrl];
          console.log('🔍 Found URL in knowledge base:', url);
        } else {
          // If not in knowledge base, add https protocol
          url = 'https://' + url;
        }
      }
      
      if (newTab !== false) {  // Default to new tab unless explicitly set to false
        window.open(url, '_blank');
        console.log('✅ Opened ' + url + ' in new tab');
      } else {
        window.location.href = url;
        console.log('✅ Navigating to ' + url);
      }
    } catch (error) {
      console.error('❌ Failed to navigate to URL:', error);
    }
  }

  function handleClickElement(params) {
    const { selector, text, index } = params;
    
    try {
      let element = null;
      
      if (selector) {
        const elements = document.querySelectorAll(selector);
        element = index ? elements[index] : elements[0];
      } else if (text) {
        // Find element by text content
        element = Array.from(document.querySelectorAll('*')).find(el => 
          el.textContent?.toLowerCase().includes(text.toLowerCase())
        );
      }
      
      if (element && element instanceof HTMLElement) {
        element.click();
        console.log('✅ Clicked element: ' + (selector || text));
      } else {
        console.log('❌ Element not found: ' + (selector || text));
      }
    } catch (error) {
      console.error('❌ Failed to click element:', error);
    }
  }

  function handleFindElement(params) {
    const { selector, text } = params;
    
    try {
      let elements = [];
      
      if (selector) {
        elements = Array.from(document.querySelectorAll(selector));
      } else if (text) {
        elements = Array.from(document.querySelectorAll('*')).filter(el => 
          el.textContent?.toLowerCase().includes(text.toLowerCase())
        );
      }
      
      console.log('✅ Found ' + elements.length + ' elements matching: ' + (selector || text));
      return elements.length;
    } catch (error) {
      console.error('❌ Failed to find elements:', error);
      return 0;
    }
  }

  function handleGetPageInfo() {
    try {
      const info = {
        title: document.title,
        url: window.location.href,
        domain: window.location.hostname,
        scrollPosition: window.pageYOffset,
        pageHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight
      };
      
      console.log('✅ Page info retrieved:', info);
      return info;
    } catch (error) {
      console.error('❌ Failed to get page info:', error);
    }
  }

  function handleGoBack() {
    try {
      window.history.back();
      console.log('✅ Navigated back');
    } catch (error) {
      console.error('❌ Failed to go back:', error);
    }
  }

  function handleGoForward() {
    try {
      window.history.forward();
      console.log('✅ Navigated forward');
    } catch (error) {
      console.error('❌ Failed to go forward:', error);
    }
  }

  function handleRefreshPage() {
    try {
      window.location.reload();
      console.log('✅ Page refreshed');
    } catch (error) {
      console.error('❌ Failed to refresh page:', error);
    }
  }

  function handleScrollToElement(params) {
    const { selector, text, position } = params;
    
    try {
      let element = null;
      
      if (selector) {
        element = document.querySelector(selector);
      } else if (text) {
        element = Array.from(document.querySelectorAll('*')).find(el => 
          el.textContent?.toLowerCase().includes(text.toLowerCase())
        );
      }
      
      if (element) {
        element.scrollIntoView({ 
          behavior: 'smooth',
          block: position || 'center',
          inline: 'nearest'
        });
        console.log('✅ Scrolled to element: ' + (selector || text));
      } else {
        console.log('❌ Element not found for scrolling: ' + (selector || text));
      }
    } catch (error) {
      console.error('❌ Failed to scroll to element:', error);
    }
  }

  function handleTypeText(params) {
    const { selector, text, clear } = params;
    
    try {
      const element = document.querySelector(selector);
      
      if (element && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        if (clear) {
          element.value = '';
        }
        
        element.value += text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        
        console.log('✅ Typed text into element: ' + selector);
      } else {
        console.log('❌ Input element not found: ' + selector);
      }
    } catch (error) {
      console.error('❌ Failed to type text:', error);
    }
  }

  // Process voice commands for navigation
  function processVoiceCommand(transcript) {
    console.log("🎤 Processing voice command:", transcript);

    const command = transcript.toLowerCase();

    // Website navigation commands - more flexible matching
    const navigationPatterns = [
      { patterns: ["open google", "go to google", "navigate to google", "visit google"], url: "https://www.google.com" },
      { patterns: ["open youtube", "go to youtube", "navigate to youtube", "visit youtube"], url: "https://www.youtube.com" },
      { patterns: ["open facebook", "go to facebook", "navigate to facebook", "visit facebook"], url: "https://www.facebook.com" },
      { patterns: ["open twitter", "go to twitter", "navigate to twitter", "visit twitter", "open x", "go to x"], url: "https://www.twitter.com" },
      { patterns: ["open github", "go to github", "navigate to github", "visit github"], url: "https://www.github.com" },
      { patterns: ["open linkedin", "go to linkedin", "navigate to linkedin", "visit linkedin"], url: "https://www.linkedin.com" },
      { patterns: ["open instagram", "go to instagram", "navigate to instagram", "visit instagram"], url: "https://www.instagram.com" },
      { patterns: ["open amazon", "go to amazon", "navigate to amazon", "visit amazon"], url: "https://www.amazon.com" },
      { patterns: ["open netflix", "go to netflix", "navigate to netflix", "visit netflix"], url: "https://www.netflix.com" },
      { patterns: ["open reddit", "go to reddit", "navigate to reddit", "visit reddit"], url: "https://www.reddit.com" },
      { patterns: ["open wikipedia", "go to wikipedia", "navigate to wikipedia", "visit wikipedia"], url: "https://www.wikipedia.org" },
      { patterns: ["open gmail", "go to gmail", "navigate to gmail", "visit gmail"], url: "https://mail.google.com" },
      { patterns: ["open maps", "go to maps", "navigate to maps", "visit maps", "open google maps"], url: "https://maps.google.com" },
    ];

    // Check for exact pattern matches first
    for (const nav of navigationPatterns) {
      for (const pattern of nav.patterns) {
        if (command.includes(pattern)) {
          handleNavigation(nav.url);
          return true;
        }
      }
    }

    // Search functionality - improved patterns
    const searchPatterns = [
      /search\s+(?:for|about)?\s+(.+)/i,
      /google\s+(.+)/i,
      /find\s+(.+)/i,
      /look\s+up\s+(.+)/i,
      /look\s+for\s+(.+)/i
    ];

    for (const pattern of searchPatterns) {
      const searchMatch = command.match(pattern);
      if (searchMatch && searchMatch[1]) {
        const searchQuery = searchMatch[1].trim();
        if (searchQuery && searchQuery.length > 1) {
          const searchUrl = "https://www.google.com/search?q=" + encodeURIComponent(searchQuery);
          handleNavigation(searchUrl);
          return true;
        }
      }
    }

    // General navigation - improved regex
    const generalNavPatterns = [
      /(?:go to|open|navigate to|visit)\s+(?:the\s+)?(?:website\s+)?([a-z0-9\-\.]+\.[a-z]{2,})/i,
      /(?:go to|open|navigate to|visit)\s+(?:the\s+)?(?:site\s+)?([a-z0-9\-\.]+\.[a-z]{2,})/i,
      /(?:take me to|bring me to)\s+([a-z0-9\-\.]+\.[a-z]{2,})/i
    ];

    for (const pattern of generalNavPatterns) {
      const goToMatch = command.match(pattern);
      if (goToMatch && goToMatch[1]) {
        handleNavigation("https://" + goToMatch[1]);
        return true;
      }
    }

    // URL detection - fixed and improved
    const urlMatch = transcript.match(/(?:https?:\\\/\\\/)?(?:www\\.)?([a-z0-9\\-\\.]+\\.[a-z]{2,}(?:\\\/\\S*)?)/i);
    if (urlMatch) {
      let url = urlMatch[0].replace(/\\\//g, '/'); // Fix escaped slashes
      if (!url.startsWith("http")) {
        url = "https://" + url;
      }
      handleNavigation(url);
      return true;
    }

    return false;
  }

  // Enhanced Navigation handler function
  function handleNavigation(url) {
    if (!url) return false;

    try {
      // Make sure URL has protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      // Validate URL format
      const urlObj = new URL(url);

      // Check if URL has a valid domain
      if (!urlObj.hostname.includes('.')) {
        console.error('Invalid URL hostname:', urlObj.hostname);
        return false;
      }

      // Announce navigation with more context
      console.log('🌐 Opening:', url);
      
      // Create a more visible notification
      const notification = document.createElement('div');
      notification.style.cssText = \`
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      \`;
      notification.textContent = 'Opening: ' + urlObj.hostname;
      document.body.appendChild(notification);
      
      // Remove notification after 3 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 3000);
      
      // Navigate to the URL immediately
      window.open(url, "_blank", "noopener,noreferrer");

      return true;
    } catch (error) {
      console.error('Navigation error:', error);
      
      // Show error notification
      const errorNotification = document.createElement('div');
      errorNotification.style.cssText = \`
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f44336;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      \`;
      errorNotification.textContent = 'Failed to open: ' + url;
      document.body.appendChild(errorNotification);
      
      setTimeout(() => {
        if (errorNotification.parentNode) {
          errorNotification.parentNode.removeChild(errorNotification);
        }
      }, 3000);
      
      return false;
    }
  }

  // VAPI Message Handler for navigation and other functions
  function handleVapiMessage(message) {
    console.log('📨 Processing VAPI message:', message);
    
    // Handle navigation function calls
    if (message.type === 'function-call') {
      handleNavigationCommand(message);
    }
    
    // Handle transcripts and process voice commands
    if (message.type === 'transcript' && message.transcript) {
      console.log('📝 Transcript: ' + message.role + ': ' + message.transcript);
      
      // Process transcript for direct voice commands
      if (message.role === 'user') {
        const wasNavigationCommand = processVoiceCommand(message.transcript);
        if (wasNavigationCommand) {
          console.log('✅ Processed navigation command:', message.transcript);
        }
      }
    }
    
    // Handle conversation items
    if (message.type === 'conversation-item') {
      console.log('💬 Conversation item:', message);
    }
    
    // Handle other message types
    if (message.type === 'response') {
      console.log('🤖 AI Response:', message);
    }
  }
  
  async function activateVoiceBot() {
    try {
      console.log('🎤 Activating voice bot...');
      console.log('Bot info available:', window.botInfo);

      if (!window.botInfo || !window.botInfo.vapiAssistantId) {
        console.error('No VAPI assistant ID available', window.botInfo);
        alert('Voice bot is not properly configured. Assistant ID missing. Please contact support.');
        return;
      }

      // Load VAPI SDK if not already loaded
      if (!window.vapiSDK) {
        console.log('Loading VAPI SDK...');
        await loadVapiSDK();
        console.log('VAPI SDK loaded successfully, vapiSDK available:', !!window.vapiSDK);
      } else {
        console.log('VAPI SDK already loaded');
      }

      // Initialize VAPI with the bot's assistant ID
      if (window.vapiSDK && window.botInfo.vapiAssistantId) {
        console.log('🚀 Initializing VAPI with assistant:', window.botInfo.vapiAssistantId);

        // VAPI public key from environment
        const vapiPublicKey = '${Deno.env.get('VAPI_PUBLIC_KEY') || 'feed51cc-99d9-466c-a0e3-085bab7122d2'}';
        
        console.log('Creating Vapi instance...');
        
        // Create VAPI instance using vapiSDK
        window.vapiInstance = window.vapiSDK.run({
          apiKey: vapiPublicKey,
          assistant: window.botInfo.vapiAssistantId,
          config: {
            // Enable function calling for navigation
            onMessage: (message) => {
              console.log('📨 VAPI message received:', message);
              handleVapiMessage(message);
            },
            onCall: (callType) => {
              console.log('📞 Call event:', callType);
              if (callType === 'call-start') {
                updateWidgetState('active');
              } else if (callType === 'call-end') {
                updateWidgetState('idle');
              }
            },
            onSpeech: (speechType) => {
              console.log('🎤 Speech event:', speechType);
              if (speechType === 'speech-start') {
                updateWidgetState('listening');
              } else if (speechType === 'speech-end') {
                updateWidgetState('processing');
              }
            }
          }
        });
        
        console.log('Vapi instance created successfully:', !!window.vapiInstance);
        
        // Fallback event listeners if config events don't work
        if (window.vapiInstance && typeof window.vapiInstance.on === 'function') {
          window.vapiInstance.on('message', handleVapiMessage);
          window.vapiInstance.on('speech-start', () => updateWidgetState('listening'));
          window.vapiInstance.on('speech-end', () => updateWidgetState('processing'));
          window.vapiInstance.on('call-start', () => updateWidgetState('active'));
          window.vapiInstance.on('call-end', () => updateWidgetState('idle'));
          window.vapiInstance.on('error', (error) => {
            console.error('❌ VAPI error:', error);
            updateWidgetState('error');
          });
        }

        // Update widget to show active state
        const widget = document.getElementById('vapi-bot-widget');
        if (widget) {
          widget.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
          widget.innerHTML = '<svg width="24" height="24" fill="white" viewBox="0 0 24 24">' +
            '<path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>' +
            '</svg>';
        }

        console.log('✅ VAPI voice bot activated successfully!');
      } else {
        const errorMsg = !window.vapiSDK ? 'VAPI SDK not available after loading' : 'No VAPI assistant ID found';
        console.error('❌ Activation failed:', errorMsg, {
          vapiAvailable: !!window.vapiSDK,
          assistantId: window.botInfo?.vapiAssistantId,
          botInfo: window.botInfo
        });
        throw new Error(errorMsg);
      }

    } catch (error) {
      console.error('Error activating voice bot:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        vapiAvailable: !!window.vapiSDK,
        botInfo: window.botInfo
      });
      updateWidgetState('error');
      alert('Failed to start voice bot: ' + error.message + '. Please try again.');
    }
  }
  
  // Helper function to update widget visual state
  function updateWidgetState(state) {
    const widget = document.getElementById('vapi-bot-widget');
    if (!widget) return;
    
    switch(state) {
      case 'active':
        widget.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
        widget.innerHTML = '<svg width="24" height="24" fill="white" viewBox="0 0 24 24">' +
          '<path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>' +
          '</svg>';
        break;
      case 'listening':
        widget.style.background = 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)';
        widget.style.animation = 'pulse 1.5s infinite';
        widget.innerHTML = '<svg width="24" height="24" fill="white" viewBox="0 0 24 24">' +
          '<path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>' +
          '</svg>';
        break;
      case 'processing':
        widget.style.background = 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)';
        widget.style.animation = 'spin 2s linear infinite';
        widget.innerHTML = '<svg width="24" height="24" fill="white" viewBox="0 0 24 24">' +
          '<path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/>' +
          '</svg>';
        break;
      case 'error':
        widget.style.background = 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)';
        widget.style.animation = 'none';
        widget.innerHTML = '<svg width="24" height="24" fill="white" viewBox="0 0 24 24">' +
          '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>' +
          '</svg>';
        break;
      case 'idle':
      default:
        widget.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        widget.style.animation = 'none';
        widget.innerHTML = '<svg width="24" height="24" fill="white" viewBox="0 0 24 24">' +
          '<path d="M12 1a11 11 0 0 0-11 11v6a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6a7 7 0 0 1 14 0v6a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6a11 11 0 0 0-11-11zm0 7a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0v-8a3 3 0 0 0-3-3z"/>' +
          '</svg>';
        break;
    }
  }

  // Load VAPI SDK dynamically with the correct CDN for HTML script tags
  function loadVapiSDK() {
    return new Promise((resolve, reject) => {
      if (window.vapiSDK) {
        resolve(window.vapiSDK);
        return;
      }

      // Use the official VAPI HTML script tag CDN - this is the correct UMD bundle
      const vapiScriptUrl = 'https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js';
      
      console.log('Loading VAPI SDK from official CDN: ' + vapiScriptUrl);
      
      const script = document.createElement('script');
      script.src = vapiScriptUrl;
      script.crossOrigin = 'anonymous';
      script.type = 'text/javascript';
      
      script.onload = function() {
        console.log('✅ VAPI SDK script loaded successfully');
        
        // Wait for the SDK to initialize and expose the global Vapi
        let attempts = 0;
        const maxAttempts = 10;
        
        const checkVapi = () => {
          attempts++;
          if (window.vapiSDK) {
            console.log('✅ VAPI SDK is now available');
            resolve(window.vapiSDK);
          } else if (attempts < maxAttempts) {
            console.log('Waiting for VAPI SDK... attempt ' + attempts + '/' + maxAttempts);
            setTimeout(checkVapi, 500);
          } else {
            console.error('❌ VAPI SDK failed to initialize after', maxAttempts, 'attempts');
            reject(new Error('VAPI SDK not available after loading'));
          }
        };
        
        checkVapi();
      };
      
      script.onerror = function(error) {
        console.error('❌ Failed to load VAPI SDK:', error);
        reject(new Error('Failed to load VAPI SDK from CDN'));
      };
      
      document.head.appendChild(script);
    });
  }
  
  console.log('🤖 VAPI Voice Bot script loaded and initialized successfully');
})();`;

    return new Response(jsContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error) {
    console.error('Error serving JavaScript:', error);
    return new Response(
      `console.error('Failed to load voice bot script: ${(error as Error).message}');`,
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/javascript; charset=utf-8',
        },
      }
    );
  }
});