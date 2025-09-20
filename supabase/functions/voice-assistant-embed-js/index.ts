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
        const config = {
          position: VAPI_CONFIG.position,
          theme: VAPI_CONFIG.theme,
          mode: VAPI_CONFIG.mode,
          audio: {
            enableEchoCancellation: true,
            enableNoiseSuppression: false,
            enableAutoGainControl: false
          },
          microphone: {
            sampleRate: 44100,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        };

        this.vapiWidget = window.vapiSDK.run({
          apiKey: VAPI_CONFIG.apiKey,
          assistant: VAPI_CONFIG.assistant,
          config: config
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
        console.log('📨 Message received:', message);
        
        // Only process transcript messages
        if (message.type === "transcript" && message.transcriptType === "final") {
          this.handleTranscript(message);
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
      if (!transcript || transcript.length < 3) {
        console.log('⚠️ Empty or too short transcript, ignoring');
        return;
      }

      // Simple duplicate check
      if (transcript === this.lastProcessedTranscript) {
        console.log('⚠️ Duplicate transcript, ignoring');
        return;
      }

      console.log('📝 Processing transcript:', transcript);
      this.lastProcessedTranscript = transcript;
      
      // Only process if call is active and assistant is not speaking
      if (!this.callActive) {
        console.log('⚠️ Call not active, ignoring transcript');
        return;
      }

      if (this.assistantSpeaking) {
        console.log('⚠️ Assistant speaking, ignoring transcript');
        return;
      }

      // Simple bot speech pattern check
      const lowerTranscript = transcript.toLowerCase();
      const botIndicators = [
        'i can help', 'let me help', 'i\\'ll navigate', 'i understand',
        'taking you to', 'going to', 'i found', 'here are the',
        'would you like', 'how can i assist', 'navigating to'
      ];

      if (botIndicators.some(indicator => lowerTranscript.includes(indicator))) {
        console.log('⚠️ Detected bot speech pattern, ignoring:', transcript);
        this.updateStatus(\`🤖 Ignored: "\${transcript}"\`);
        return;
      }

      // Process as user command
      this.updateStatus(\`👤 Processing: "\${transcript}"\`);
      setTimeout(() => {
        this.processCommand(lowerTranscript, transcript);
      }, 500);
    }

    processCommand(lowerTranscript, originalTranscript) {
      console.log('⚡ Processing command:', lowerTranscript);

      // Direct command matching - simple and reliable
      const commands = {
        // Navigation commands
        'home': () => this.navigateTo(['home', 'homepage']),
        'go home': () => this.navigateTo(['home', 'homepage']),
        'take me home': () => this.navigateTo(['home', 'homepage']),
        'about': () => this.navigateTo(['about', 'about us']),
        'go to about': () => this.navigateTo(['about', 'about us']),
        'contact': () => this.navigateTo(['contact', 'contact us']),
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
        commands[lowerTranscript]();
        this.updateStatus(\`✅ Executed: \${originalTranscript}\`);
        return;
      }

      // Check for partial matches
      for (const [command, action] of Object.entries(commands)) {
        if (lowerTranscript.includes(command)) {
          action();
          this.updateStatus(\`✅ Executed: \${originalTranscript}\`);
          return;
        }
      }

      // Try fuzzy matching for page elements
      const element = this.findElementByVoice(lowerTranscript);
      if (element) {
        this.clickElement(element);
        const elementText = this.getElementText(element);
        this.updateStatus(\`✅ Clicked: \${elementText}\`);
        return;
      }

      // Command not recognized
      this.updateStatus(\`❓ Not recognized: "\${originalTranscript}"\`);
      console.log('❓ Command not recognized:', lowerTranscript);
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

})();`;

  return new Response(jsContent, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    },
  });
});