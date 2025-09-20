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
                      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      console.log('[VoiceAI] Navigated to section:', sectionName);
                      
                      // Visual feedback
                      element.style.transition = 'background-color 0.5s ease';
                      const originalBg = element.style.backgroundColor;
                      element.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                      setTimeout(() => {
                        element.style.backgroundColor = originalBg;
                        sendFeedbackToBot(\`Successfully navigated to section "\${sectionName}". Found element: \${element.tagName.toLowerCase()} with text: "\${element.textContent?.substring(0, 100)}..."\`);
                      }, 1000);
                    } else {
                      sendFeedbackToBot(\`Could not find section "\${sectionName}". Available sections might include headers or elements with specific IDs.\`);
                    }
                  }
                  break;
                  
                case 'get_page_info':
                  const pageInfo = {
                    title: document.title,
                    url: window.location.href,
                    scrollPosition: Math.round(window.pageYOffset),
                    pageHeight: Math.round(document.documentElement.scrollHeight),
                    viewportHeight: Math.round(window.innerHeight),
                    scrollPercent: Math.round((window.pageYOffset / (document.documentElement.scrollHeight - window.innerHeight)) * 100)
                  };
                  
                  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
                    .slice(0, 10)
                    .map(h => \`\${h.tagName}: \${h.textContent?.substring(0, 50)}...\`)
                    .join(', ');
                  
                  sendFeedbackToBot(\`Page Info - Title: "\${pageInfo.title}", URL: \${pageInfo.url}, Scroll: \${pageInfo.scrollPercent}% (\${pageInfo.scrollPosition}px of \${pageInfo.pageHeight}px). Main headings: \${headings}\`);
                  break;
                  
                case 'open_website':
                case 'navigate_to_url':
                  const query = functionCall.parameters?.query || functionCall.parameters?.url;
                  if (query) {
                    let url = query;
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                      if (url.includes(' ') || (!url.includes('.') && url.length > 0)) {
                        url = \`https://www.google.com/search?q=\${encodeURIComponent(url)}\`;
                      } else {
                        url = \`https://\${url}\`;
                      }
                    }
                    
                    const newWindow = window.open(url, '_blank');
                    if (newWindow) {
                      sendFeedbackToBot(\`Successfully opened new tab with URL: \${url}\`);
                    } else {
                      sendFeedbackToBot(\`Attempted to open \${url} but popup might be blocked. Please check browser settings.\`);
                    }
                  }
                  break;
                  
                case 'click_element':
                  const elementText = functionCall.parameters?.text?.toLowerCase();
                  if (elementText) {
                    const selectors = [
                      'button', 'a', '[role="button"]', '[data-action]', 
                      'input[type="button"]', 'input[type="submit"]', '.btn', '[onclick]'
                    ];
                    
                    let found = false;
                    for (const selector of selectors) {
                      const elements = document.querySelectorAll(selector);
                      for (let i = 0; i < elements.length; i++) {
                        const element = elements[i];
                        const text = element.textContent || element.getAttribute('aria-label') || element.getAttribute('title');
                        if (text && text.toLowerCase().includes(elementText)) {
                          // Visual feedback before clicking
                          element.style.transition = 'transform 0.2s ease';
                          element.style.transform = 'scale(0.95)';
                          setTimeout(() => {
                            element.style.transform = 'scale(1)';
                            element.click();
                            sendFeedbackToBot(\`Successfully clicked element: "\${text.substring(0, 50)}..." (\${element.tagName.toLowerCase()})\`);
                          }, 100);
                          
                          console.log('[VoiceAI] Clicked element:', elementText);
                          found = true;
                          break;
                        }
                      }
                      if (found) break;
                    }
                    
                    if (!found) {
                      const availableElements = Array.from(document.querySelectorAll('button, a')).slice(0, 5).map(el => el.textContent?.substring(0, 30)).join(', ');
                      sendFeedbackToBot(\`Could not find clickable element containing "\${elementText}". Available clickable elements: \${availableElements}\`);
                    }
                  }
                  break;
                  
                case 'read_page_content':
                  const visibleText = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, div'))
                    .filter(el => el.offsetHeight > 0)
                    .map(el => el.textContent?.trim())
                    .filter(text => text && text.length > 10)
                    .slice(0, 20)
                    .join(' ');
                  
                  sendFeedbackToBot(\`Page content preview (first 500 chars): \${visibleText.substring(0, 500)}...\`);
                  break;
                  
                default:
                  sendFeedbackToBot(\`Unknown navigation command: \${functionCall.name}\`);
              }
            } catch (error) {
              console.error('[VoiceAI] Error executing function:', error);
              sendFeedbackToBot(\`Error executing \${functionCall.name}: \${error.message}\`);
            }
          }
        }
        
        // Store conversation memory
        if (message.type === 'conversation-update') {
          conversationMemory = message.conversation || [];
          localStorage.setItem(MEMORY_KEY, JSON.stringify(conversationMemory));
        }
      });
      
      vapi.on('error', (error) => {
        console.error('[VoiceAI] Error:', error);
        isActive = false;
        button.style.background = '#ef4444';
        button.innerHTML = '❌';
        button.style.animation = 'none';
        button.title = 'Voice assistant error - click to retry';
      });
    }
    
    // Enhanced command processing - like the Universal Voice Navigator
    function processEnhancedCommand(lowerTranscript, originalTranscript, sendFeedbackToBot) {
      console.log('[VoiceAI] ⚡ Processing enhanced command:', lowerTranscript);

      // Direct command matching - simple and reliable
      const commands = {
        // Navigation commands
        'home': () => navigateToPage(['home', 'homepage']),
        'go home': () => navigateToPage(['home', 'homepage']),
        'take me home': () => navigateToPage(['home', 'homepage']),
        'about': () => navigateToPage(['about', 'about us']),
        'go to about': () => navigateToPage(['about', 'about us']),
        'contact': () => navigateToPage(['contact', 'contact us']),
        'contact us': () => navigateToPage(['contact', 'contact us']),
        'services': () => navigateToPage(['services', 'our services']),
        'products': () => navigateToPage(['products', 'shop', 'store']),
        'blog': () => navigateToPage(['blog', 'articles', 'news']),
        'login': () => navigateToPage(['login', 'sign in', 'log in']),
        'sign in': () => navigateToPage(['login', 'sign in', 'log in']),
        'register': () => navigateToPage(['register', 'sign up', 'join']),
        'sign up': () => navigateToPage(['register', 'sign up', 'join']),
        
        // Scrolling commands
        'scroll down': () => scrollPage('down'),
        'page down': () => scrollPage('down'),
        'scroll up': () => scrollPage('up'),
        'page up': () => scrollPage('up'),
        'top': () => scrollPage('top'),
        'go to top': () => scrollPage('top'),
        'scroll to top': () => scrollPage('top'),
        'bottom': () => scrollPage('bottom'),
        'go to bottom': () => scrollPage('bottom'),
        'scroll to bottom': () => scrollPage('bottom'),
        
        // Utility commands
        'refresh': () => refreshPage(),
        'reload': () => refreshPage(),
        'help': () => showHelp(),
        'what can i do': () => showHelp(),
        'analyze page': () => analyzeCurrentPage()
      };

      // Check for exact command matches first
      if (commands[lowerTranscript]) {
        commands[lowerTranscript]();
        sendFeedbackToBot(\`✅ Executed: \${originalTranscript}\`);
        return;
      }

      // Check for partial matches
      for (const [command, action] of Object.entries(commands)) {
        if (lowerTranscript.includes(command)) {
          action();
          sendFeedbackToBot(\`✅ Executed: \${originalTranscript}\`);
          return;
        }
      }

      // Try fuzzy matching for page elements
      const element = findElementByVoice(lowerTranscript);
      if (element) {
        clickElementWithFeedback(element, sendFeedbackToBot);
        return;
      }

      // Command not recognized
      sendFeedbackToBot(\`❓ Not recognized: "\${originalTranscript}"\`);
      console.log('[VoiceAI] ❓ Command not recognized:', lowerTranscript);
    }
    
    // Page content analysis for fuzzy matching
    function analyzePageContent() {
      console.log('[VoiceAI] 🔍 Analyzing page content...');
      
      const selectors = [
        'a[href]:not([href^="#"]):not([href^="javascript:"]):not([href^="mailto:"]):not([href^="tel:"])',
        'button:not([disabled])',
        '[role="button"]:not([disabled])',
        'input[type="submit"]:not([disabled])',
        'input[type="button"]:not([disabled])',
        '.btn:not([disabled])',
        '.button:not([disabled])'
      ];
      
      const elements = [];
      
      selectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => {
            if (isElementVisible(el)) {
              const text = getElementText(el);
              if (text && text.length > 0) {
                elements.push({
                  element: el,
                  text: text,
                  href: el.href || ''
                });
              }
            }
          });
        } catch (e) {
          console.warn('[VoiceAI] Selector error:', selector, e);
        }
      });
      
      console.log(\`[VoiceAI] 🔍 Found \${elements.length} interactive elements\`);
      return elements;
    }
    
    function isElementVisible(element) {
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

    function getElementText(element) {
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
    
    function navigateToPage(searchTerms) {
      console.log('[VoiceAI] 🧭 Navigating to:', searchTerms);
      
      const currentPageElements = analyzePageContent();
      let bestElement = null;
      let bestScore = 0;
      
      currentPageElements.forEach(item => {
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
        clickElementWithFeedback(bestElement);
        return true;
      } else {
        console.log('[VoiceAI] ❌ Navigation target not found:', searchTerms);
        return false;
      }
    }
    
    function scrollPage(direction) {
      console.log('[VoiceAI] 📜 Scrolling:', direction);
      
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
    }

    function findElementByVoice(transcript) {
      const currentPageElements = analyzePageContent();
      const words = transcript.split(' ').filter(word => word.length > 2);
      let bestElement = null;
      let bestScore = 0;
      
      currentPageElements.forEach(item => {
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

    function clickElementWithFeedback(element, sendFeedbackToBot) {
      try {
        console.log('[VoiceAI] 🖱️ Clicking element:', getElementText(element));
        
        // Scroll element into view first
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Wait a moment then click
        setTimeout(() => {
          element.focus();
          element.click();
          
          if (sendFeedbackToBot) {
            const elementText = getElementText(element);
            sendFeedbackToBot(\`✅ Clicked: \${elementText}\`);
          }
        }, 300);
        
      } catch (error) {
        console.error('[VoiceAI] ❌ Click failed:', error);
        if (sendFeedbackToBot) {
          sendFeedbackToBot('❌ Click failed');
        }
      }
    }

    function refreshPage() {
      window.location.reload();
    }

    function showHelp() {
      const commands = [
        'home, about, contact, services',
        'scroll up/down, go to top/bottom',
        'login, register, blog, products'
      ].join(' | ');
      
      return \`ℹ️ Try: \${commands}\`;
    }

    function analyzeCurrentPage() {
      const elements = analyzePageContent();
      const count = elements.length;
      const sample = elements
        .slice(0, 5)
        .map(item => item.text)
        .join(', ');
      
      return \`📊 \${count} elements: \${sample}\`;
    }
    
    console.log('[VoiceAI] Voice Assistant initialized successfully');
    return true;
  }

  // Auto-initialize when DOM is ready
  function autoInitialize() {
    const config = getConfiguration();
    if (config.assistantId && config.vapiAssistantId) {
      console.log('[VoiceAI] Auto-initializing with config:', config);
      initializeVoiceAssistant(config);
    } else {
      console.warn('[VoiceAI] No valid configuration found for auto-initialization');
    }
  }

  // Manual initialization API
  window.VoiceAIAssistant = {
    init: initializeVoiceAssistant,
    getConfig: getConfiguration
  };

  // Auto-initialize when script loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInitialize);
  } else {
    autoInitialize();
  }

  console.log('[VoiceAI] Voice Assistant embed script loaded successfully');
})();`;

  return new Response(jsContent, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
      'Permissions-Policy': 'microphone=*, camera=*, geolocation=*, display-capture=*',
      'Feature-Policy': 'microphone *; camera *; geolocation *; display-capture *',
    },
  });
});