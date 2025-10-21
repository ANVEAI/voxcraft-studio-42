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

  // Get the requesting domain to use in the JavaScript
  const url = new URL(req.url);
  const referer = req.headers.get('referer') || req.headers.get('origin') || 'https://voxcraft-studio.lovable.app';
  const requestingDomain = new URL(referer).origin;

  const jsContent = `(function() {
  'use strict';
  
  console.log('[VoiceAI] Loading assistant embed script from ${requestingDomain}...');

  // Auto-detect configuration from script tag or URL parameters
  function getConfiguration() {
    const scripts = document.getElementsByTagName('script');
    let config = {};
    let scriptSrc = '';
    
    // Find our script tag
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      if (script.src && (script.src.includes('voice-assistant-embed.js') || script.src.includes('${requestingDomain}'))) {
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
      try {
        const url = new URL(scriptSrc);
        config = {
          assistantId: url.searchParams.get('assistantId') || url.searchParams.get('assistant_id'),
          vapiAssistantId: url.searchParams.get('vapiAssistantId') || url.searchParams.get('vapi_assistant_id'),
          position: url.searchParams.get('position') || 'right',
          theme: url.searchParams.get('theme') || 'light',
          language: url.searchParams.get('language') || 'en'
        };
      } catch (e) {
        console.warn('[VoiceAI] Could not parse URL parameters:', e);
      }
    }
    
    console.log('[VoiceAI] Auto-detected config:', config);
    return config;
  }

  // Initialize the voice assistant
  function initializeVoiceAssistant(config) {
    if (!config.assistantId || !config.vapiAssistantId) {
      console.error('[VoiceAI] Missing required configuration. Please provide assistantId and vapiAssistantId');
      console.log('[VoiceAI] Example usage:');
      console.log('<script src="${requestingDomain}/js/voice-assistant-embed.js" data-assistant-id="your-id" data-vapi-assistant-id="your-vapi-id"></script>');
      return false;
    }

    // Create widget container
    const containerId = 'voiceai-assistant-' + config.assistantId;
    let container = document.getElementById(containerId);
    
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.cssText = 'position: fixed; bottom: 0; right: 0; z-index: 9999; pointer-events: none;';
      document.body.appendChild(container);
    }
    
    console.log('[VoiceAI] Container ready:', containerId);

    // Clear any existing content
    container.innerHTML = '';

    // Initialize conversation memory
    const MEMORY_KEY = 'voiceai-conversation-' + config.assistantId;
    let conversationMemory = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
    console.log('[VoiceAI] Loaded conversation memory:', conversationMemory.length, 'items');

    // Create the modern voice assistant button
    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Voice Assistant - Click to start conversation');
    button.setAttribute('title', 'Start voice conversation');
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.innerHTML = \`
      <svg style="width: 36px; height: 36px; color: white; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3)); pointer-events: none;" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
      border: 2px solid \${config.theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.3)'};
      background: linear-gradient(135deg, #3b82f6 0%, #6366f1 33%, #8b5cf6 66%, #a855f7 100%);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      color: white;
      font-size: 0;
      cursor: pointer;
      box-shadow: 
        0 0 20px rgba(59, 130, 246, 0.3),
        0 0 40px rgba(59, 130, 246, 0.15),
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
      outline: none;
    \`;
    
    // Glassmorphism fallback for older browsers
    if (!CSS.supports('backdrop-filter', 'blur(20px)')) {
      button.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.95) 0%, rgba(99, 102, 241, 0.95) 33%, rgba(139, 92, 246, 0.95) 66%, rgba(168, 85, 247, 0.95) 100%)';
    }
    
    button.onmouseenter = function() { 
      this.style.transform = 'scale(1.08) rotate(3deg) translateZ(0)'; 
      this.style.boxShadow = '0 0 30px rgba(59, 130, 246, 0.5), 0 0 60px rgba(59, 130, 246, 0.25), 0 12px 48px rgba(0, 0, 0, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.3)';
    };
    button.onmouseleave = function() { 
      this.style.transform = 'translateZ(0)'; 
      this.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.3), 0 0 40px rgba(59, 130, 246, 0.15), 0 8px 32px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
    };
    button.onmousedown = function() {
      this.style.transform = 'scale(0.95) translateZ(0)';
    };
    button.onmouseup = function() {
      this.style.transform = 'translateZ(0)';
    };
    
    // Keyboard navigation support
    button.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.click();
      }
    });
    
    container.appendChild(button);
    console.log('[VoiceAI] Modern button added and visible');

    let isActive = false;
    let vapi = null;

    // Load Vapi SDK with multiple CDN fallbacks
    function loadVapiSDK() {
      return new Promise((resolve, reject) => {
        if (window.Vapi) {
          console.log('[VoiceAI] Vapi SDK already available');
          resolve(true);
          return;
        }
        
        const cdnUrls = [
          'https://cdn.jsdelivr.net/npm/@vapi-ai/web@2.3.8/dist/index.js',
          'https://unpkg.com/@vapi-ai/web@2.3.8/dist/index.js',
          'https://cdn.skypack.dev/@vapi-ai/web@2.3.8',
          'https://esm.sh/@vapi-ai/web@2.3.8'
        ];
        
        let currentCdnIndex = 0;
        
        function tryLoadFromCdn() {
          if (currentCdnIndex >= cdnUrls.length) {
            reject(new Error('All CDN sources failed to load Vapi SDK'));
            return;
          }
          
          const script = document.createElement('script');
          const currentUrl = cdnUrls[currentCdnIndex];
          script.src = currentUrl;
          script.crossOrigin = 'anonymous';
          
          script.onload = function() {
            console.log('[VoiceAI] Vapi SDK loaded from:', currentUrl);
            setTimeout(() => {
              if (window.Vapi) {
                resolve(true);
              } else {
                console.log('[VoiceAI] Vapi not available, trying next CDN...');
                currentCdnIndex++;
                document.head.removeChild(script);
                tryLoadFromCdn();
              }
            }, 300);
          };
          
          script.onerror = function() {
            console.error('[VoiceAI] Failed to load from:', currentUrl);
            if (script.parentNode) {
              document.head.removeChild(script);
            }
            currentCdnIndex++;
            tryLoadFromCdn();
          };
          
          document.head.appendChild(script);
        }
        
        tryLoadFromCdn();
      });
    }
    
    // Initialize with retry logic
    async function initializeWithRetry(retries = 3) {
      try {
        await loadVapiSDK();
        initializeRealVapi();
      } catch (error) {
        console.error('[VoiceAI] Failed to initialize, retries left:', retries - 1);
        if (retries > 1) {
          setTimeout(() => initializeWithRetry(retries - 1), 2000);
        } else {
          console.error('[VoiceAI] All initialization attempts failed');
          // Show user-friendly error
          button.style.background = '#ef4444';
          button.innerHTML = '❌';
          button.title = 'Voice assistant failed to load. Please refresh the page.';
        }
      }
    }
    
    initializeWithRetry();
    
    function initializeRealVapi() {
      try {
        console.log('[VoiceAI] Initializing Vapi...');
        const Vapi = window.Vapi;
        if (!Vapi) throw new Error('Vapi SDK not available');
        
        vapi = new Vapi('${Deno.env.get('VITE_VAPI_PUBLIC_KEY') || 'feed51cc-99d9-466c-a0e3-085bab7122d2'}');
        console.log('[VoiceAI] Vapi instance created successfully');
        setupEventListeners();
        
        // Update button to show ready state
        button.style.background = config.theme === 'dark' ? '#1f2937' : '#3b82f6';
        button.innerHTML = '🎤';
        button.title = 'Voice assistant ready - click to start conversation';
        
      } catch (error) {
        console.error('[VoiceAI] Failed to initialize Vapi:', error);
        throw error;
      }
    }
    
    // Button click handler
    button.onclick = async function() {
      console.log('[VoiceAI] Button clicked, isActive:', isActive, 'vapi available:', !!vapi);
      
      if (!vapi) {
        console.error('[VoiceAI] Vapi not initialized yet');
        // Show loading state
        button.innerHTML = '⏳';
        button.title = 'Loading voice assistant...';
        return;
      }
      
      if (!isActive) {
        try {
          // Request microphone permission
          try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('[VoiceAI] Microphone permission granted');
          } catch (permError) {
            console.error('[VoiceAI] Microphone permission denied:', permError);
            alert('🎤 Microphone access is required for voice interaction. Please allow microphone access and try again.');
            return;
          }
          
          console.log('[VoiceAI] Starting conversation with:', config.vapiAssistantId);
          
          const callOptions = { 
            assistantId: config.vapiAssistantId,
            // Disable Krisp to prevent WORKLET_NOT_SUPPORTED errors
            backgroundDenoisingEnabled: false
          };
          
          // Add conversation memory if available
          if (conversationMemory.length > 0) {
            const memoryContext = conversationMemory.slice(-5).map(msg => 
              \`\${msg.role}: \${msg.content}\`
            ).join('\\n');
            callOptions.systemMessage = \`Previous conversation context: \${memoryContext}\`;
            console.log('[VoiceAI] Starting with memory context');
          }
          
          await vapi.start(callOptions);
        } catch (error) {
          console.error('[VoiceAI] Failed to start call:', error);
          button.style.background = config.theme === 'dark' ? '#1f2937' : '#3b82f6';
          button.innerHTML = '🎤';
          button.title = 'Click to start voice conversation';
          alert('❌ Failed to start voice conversation. Please try again.');
        }
      } else {
        console.log('[VoiceAI] Stopping conversation');
        try {
          vapi.stop();
        } catch (error) {
          console.error('[VoiceAI] Error stopping call:', error);
        }
      }
    };
    
    function setupEventListeners() {
      vapi.on('call-start', () => {
        console.log('[VoiceAI] Conversation started');
        isActive = true;
        button.style.background = '#ef4444';
        button.innerHTML = '🔴';
        button.style.animation = 'pulse 2s infinite';
        button.title = 'Voice conversation active - click to end';
      });
      
      vapi.on('call-end', () => {
        console.log('[VoiceAI] Conversation ended');
        isActive = false;
        button.style.background = config.theme === 'dark' ? '#1f2937' : '#3b82f6';
        button.innerHTML = '🎤';
        button.style.animation = 'none';
        button.title = 'Click to start voice conversation';
      });
      
      vapi.on('speech-start', () => {
        console.log('[VoiceAI] User speech started');
        button.innerHTML = '👂';
        button.style.background = '#10b981';
        button.title = 'Listening...';
      });
      
      vapi.on('speech-end', () => {
        console.log('[VoiceAI] User speech ended');
        button.innerHTML = isActive ? '🔴' : '🎤';
        button.style.background = isActive ? '#ef4444' : (config.theme === 'dark' ? '#1f2937' : '#3b82f6');
        button.title = isActive ? 'Voice conversation active - click to end' : 'Click to start voice conversation';
      });
      
      vapi.on('message', (message) => {
        console.log('[VoiceAI] Message received:', message);
        
        // Function to send feedback to bot
        function sendFeedbackToBot(feedbackMessage) {
          try {
            vapi.send({
              type: 'add-message',
              message: {
                role: 'system',
                content: feedbackMessage
              }
            });
          } catch (error) {
            console.log('[VoiceAI] Could not send feedback:', error);
          }
        }
        
        // Enhanced transcript processing - the key addition
        if (message.type === 'transcript' && message.transcriptType === 'final') {
          const transcript = message.transcript?.trim();
          if (!transcript || transcript.length < 3) {
            console.log('[VoiceAI] ⚠️ Empty or too short transcript, ignoring');
            return;
          }

          console.log('[VoiceAI] 📝 Processing transcript:', transcript);
          
          // Simple bot speech pattern check
          const lowerTranscript = transcript.toLowerCase();
          const botIndicators = [
            'i can help', 'let me help', 'i\'ll navigate', 'i understand',
            'taking you to', 'going to', 'i found', 'here are the',
            'would you like', 'how can i assist', 'navigating to'
          ];

          if (botIndicators.some(indicator => lowerTranscript.includes(indicator))) {
            console.log('[VoiceAI] ⚠️ Detected bot speech pattern, ignoring:', transcript);
            return;
          }

          // Process enhanced command
          setTimeout(() => {
            processEnhancedCommand(lowerTranscript, transcript, sendFeedbackToBot);
          }, 500);
        }
        
        // Handle function calls for navigation
        if (message.type === 'function-call') {
          const { functionCall } = message;
          if (functionCall) {
            console.log('[VoiceAI] Executing function:', functionCall.name);
            
            try {
              switch (functionCall.name) {
                case 'scroll_page':
                  const direction = functionCall.parameters?.direction || 'down';
                  const amount = parseInt(functionCall.parameters?.amount) || 500;
                  const initialScrollY = window.pageYOffset;
                  const scrollAmount = direction === 'down' ? amount : -amount;
                  
                  window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                  console.log('[VoiceAI] Scrolled', direction, amount, 'pixels');
                  
                  setTimeout(() => {
                    const newScrollY = window.pageYOffset;
                    const scrolled = Math.abs(newScrollY - initialScrollY);
                    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                    const scrollPercent = Math.round((newScrollY / maxScroll) * 100);
                    
                    sendFeedbackToBot(\`Successfully scrolled \${direction} by \${scrolled}px. Page is now \${scrollPercent}% scrolled from top. Current position: \${Math.round(newScrollY)}px of \${Math.round(maxScroll)}px total.\`);
                  }, 500);
                  break;
                  
                case 'scroll_to_top':
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  setTimeout(() => {
                    sendFeedbackToBot('Successfully scrolled to the top of the page.');
                  }, 500);
                  break;
                  
                case 'scroll_to_bottom':
                  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                  setTimeout(() => {
                    sendFeedbackToBot('Successfully scrolled to the bottom of the page.');
                  }, 500);
                  break;
                  
                case 'navigate_to_section':
                  const sectionName = functionCall.parameters?.section?.toLowerCase();
                  if (sectionName) {
                    let element = document.getElementById(sectionName.replace(/\\s+/g, '-')) ||
                                  document.getElementById(sectionName.replace(/\\s+/g, '_')) ||
                                  document.querySelector('[data-section="' + sectionName + '"]') ||
                                  document.querySelector('[id*="' + sectionName.replace(/\\s+/g, '') + '"]');
                    
                    if (!element) {
                      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
                      element = Array.from(headings).find(el => 
                        el.textContent && el.textContent.toLowerCase().includes(sectionName)
                      );
                    }
                    
                    if (!element) {
                      const allElements = document.querySelectorAll('*');
                      element = Array.from(allElements).find(el => 
                        el.textContent && el.textContent.toLowerCase().includes(sectionName) && 
                        el.offsetHeight > 0
                      );
                    }
                    
                    if (element) {
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