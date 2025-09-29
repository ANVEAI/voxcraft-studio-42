import { useEffect } from 'react';

const VoiceAssistantEmbedJS = () => {
  useEffect(() => {
    // Set proper content type for JavaScript
    const head = document.head;
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Type';
    meta.content = 'application/javascript; charset=utf-8';
    head.appendChild(meta);
  }, []);

  const getJavaScriptContent = () => {
    return `(async function() {
  const scriptTag = document.currentScript;

  // Safely construct URL - handle both relative and absolute URLs
  let chatbotHostOrigin;
  try {
    const scriptSrc = scriptTag.getAttribute('src');
    if (!scriptSrc) {
      throw new Error('Script src attribute is missing');
    }

    // If the src is relative, construct absolute URL using current page origin
    let absoluteUrl;
    if (scriptSrc.startsWith('http://') || scriptSrc.startsWith('https://')) {
      // Already absolute URL
      absoluteUrl = scriptSrc;
    } else {
      // Relative URL - construct absolute URL
      absoluteUrl = new URL(scriptSrc, window.location.origin).href;
    }

    const url = new URL(absoluteUrl);
    chatbotHostOrigin = url.origin;
  } catch (error) {
    console.error('❌ Failed to parse script URL:', error);
    // Fallback to current page origin
    chatbotHostOrigin = window.location.origin;
  }

  const chatBotUuid = scriptTag.getAttribute('data-chatbot-uuid');
  const language = scriptTag.getAttribute('data-language') || 'en';
  const position = scriptTag.getAttribute('data-position') || 'right';
  const theme = scriptTag.getAttribute('data-theme') || 'light';
  const openRouterApiKey = scriptTag.getAttribute('data-openrouter-key') || '';
  
  console.log('🤖 VAPI Voice Bot Initializing...', {
    uuid: chatBotUuid,
    language,
    position,
    theme
  });
  
  // Wait for page to load before initializing
  window.addEventListener('load', function() {
    console.log('Page loaded, initializing voice bot...');
    initializeVoiceBot();
  });
  
  function initializeVoiceBot() {
    // Check bot status and create appropriate widget
    checkBotStatus().then(isActive => {
      if (isActive) {
        createVoiceWidget();
      } else {
        createPendingWidget();
      }
    }).catch(error => {
      console.error('Error checking bot status:', error);
      createPendingWidget();
    });
  }
  
  async function checkBotStatus() {
    try {
      const response = await fetch(\`\${chatbotHostOrigin}/functions/v1/assistant-status/\${chatBotUuid}\`);
      const result = await response.json();

      // Store bot info globally for VAPI integration
      if (result.success) {
        window.botInfo = {
          uuid: result.uuid,
          name: result.name,
          status: result.status,
          vapiAssistantId: result.vapiAssistantId
        };
      }

      return result.success && result.status === 'active';
    } catch (error) {
      console.error('Failed to check bot status:', error);

      // Fallback: Create temporary bot info for testing
      console.log('🧪 Creating fallback bot info for testing...');
      window.botInfo = {
        uuid: chatBotUuid,
        name: 'Test Voice Bot',
        status: 'active',
        vapiAssistantId: chatBotUuid // Use the actual bot UUID as fallback
      };

      return true; // Return true to show active widget for testing
    }
  }

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
      \`;
      document.head.appendChild(style);
    }
  }

  // Helper function to enforce fixed positioning with JavaScript
  function enforceFixedPositioning(container) {
    // Set positioning properties directly via JavaScript
    container.style.setProperty('position', 'fixed', 'important');
    container.style.setProperty('bottom', '20px', 'important');
    container.style.setProperty('top', 'auto', 'important');
    container.style.setProperty('z-index', '2147483647', 'important');

    if (position === 'right') {
      container.style.setProperty('right', '20px', 'important');
      container.style.setProperty('left', 'auto', 'important');
    } else {
      container.style.setProperty('left', '20px', 'important');
      container.style.setProperty('right', 'auto', 'important');
    }

    // Set up a mutation observer to prevent external CSS from overriding
    if (window.MutationObserver) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            // Re-enforce positioning if style attribute is modified
            const computedStyle = window.getComputedStyle(container);
            if (computedStyle.position !== 'fixed') {
              container.style.setProperty('position', 'fixed', 'important');
              container.style.setProperty('bottom', '20px', 'important');
              container.style.setProperty('top', 'auto', 'important');
              container.style.setProperty('z-index', '2147483647', 'important');

              if (position === 'right') {
                container.style.setProperty('right', '20px', 'important');
                container.style.setProperty('left', 'auto', 'important');
              } else {
                container.style.setProperty('left', '20px', 'important');
                container.style.setProperty('right', 'auto', 'important');
              }
            }
          }
        });
      });

      observer.observe(container, {
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }
  }

  function createVoiceWidget() {
    // Inject CSS to ensure fixed positioning works
    injectFixedPositionCSS();

    // Create active voice bot widget
    const widgetMarkup = \`
      <div id="vapi-voice-bot-container" style="
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
        max-width: none !important;
        max-height: none !important;
        min-width: 0 !important;
        min-height: 0 !important;
        float: none !important;
        clear: none !important;
        overflow: visible !important;
      ">
        <div id="vapi-bot-widget" style="
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
        ">
          <svg width="24" height="24" fill="white" viewBox="0 0 24 24">
            <path d="M12 1a11 11 0 0 0-11 11v6a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6a7 7 0 0 1 14 0v6a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6a11 11 0 0 0-11-11zm0 7a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0v-8a3 3 0 0 0-3-3z"/>
          </svg>
        </div>
      </div>
    \`;
    
    document.body.insertAdjacentHTML('beforeend', widgetMarkup);

    // Add click handler for voice activation
    const widget = document.getElementById('vapi-bot-widget');
    if (widget) {
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
    
    // Setup navigation message listener
    setupMessageListener();
  }
  
  function createPendingWidget() {
    // Inject CSS to ensure fixed positioning works
    injectFixedPositionCSS();

    // Create pending activation widget
    const widgetMarkup = \`
      <div id="vapi-voice-bot-container" style="
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
        max-width: none !important;
        max-height: none !important;
        min-width: 0 !important;
        min-height: 0 !important;
        float: none !important;
        clear: none !important;
        overflow: visible !important;
      ">
        <div id="vapi-bot-widget" style="
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
        ">
          <svg width="24" height="24" fill="white" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>
        <div id="vapi-pending-tooltip" style="
          position: absolute;
          bottom: 70px;
          \${position === 'right' ? 'right: 0;' : 'left: 0;'}
          background: rgba(0,0,0,0.8);
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          white-space: nowrap;
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        ">
          Voice bot activating within 24 hours
        </div>
      </div>
    \`;
    
    document.body.insertAdjacentHTML('beforeend', widgetMarkup);

    // Add hover effects for pending widget
    const widget = document.getElementById('vapi-bot-widget');
    const tooltip = document.getElementById('vapi-pending-tooltip');
    
    if (widget && tooltip) {
      widget.addEventListener('mouseenter', () => {
        tooltip.style.opacity = '1';
      });
      
      widget.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
      });
      
      widget.addEventListener('click', () => {
        alert('Your voice bot is being activated and will be ready within 24 hours. Thank you for your patience!');
      });
    }
  }
  
  async function activateVoiceBot() {
    try {
      console.log('🎤 Activating voice bot...');

      if (!window.botInfo || !window.botInfo.vapiAssistantId) {
        console.error('No VAPI assistant ID available');
        alert('Voice bot is not properly configured. Please contact support.');
        return;
      }

      // Load VAPI SDK if not already loaded
      if (!window.vapiSDK) {
        await loadVapiSDK();
      }

      // Initialize VAPI with the bot's assistant ID
      if (window.vapiSDK && window.botInfo.vapiAssistantId) {
        console.log('🚀 Starting VAPI with assistant:', window.botInfo.vapiAssistantId);

        // Get VAPI public key from environment
        const vapiPublicKey = '${import.meta.env.VITE_VAPI_PUBLIC_KEY}';

        // Generate unique session ID for isolation
        const sessionId = \`session_\${Date.now()}_\${Math.random().toString(36).slice(2)}\`;
        console.log('🔒 Session ID generated:', sessionId);
        
        // Store session ID globally for access
        window.sessionId = sessionId;

        // Start VAPI call with the specific assistant and session isolation
        window.vapiInstance = window.vapiSDK.run({
          apiKey: vapiPublicKey,
          assistant: window.botInfo.vapiAssistantId,
          assistantOverrides: {
            variableValues: {
              sessionId: sessionId
            }
          },
          config: {
            audio: {
              enableEchoCancellation: true,
              enableNoiseSuppression: false,
              enableAutoGainControl: true,
              disableAdvancedAudioProcessing: true
            },
            microphone: {
              sampleRate: 16000,
              echoCancellation: true,
              noiseSuppression: false,
              autoGainControl: true
            }
          }
        });

        // Setup VAPI event listeners for navigation functionality
        setupVapiEventListeners();

        // Setup session-isolated Supabase listener for function calls
        setupSupabaseListener(sessionId);

        // Update widget to show active state
        const widget = document.getElementById('vapi-bot-widget');
        if (widget) {
          widget.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
          widget.innerHTML = \`
            <svg width="24" height="24" fill="white" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
            </svg>
          \`;
        }

        console.log('✅ VAPI voice bot activated successfully!');
      } else {
        throw new Error('VAPI SDK not available');
      }

    } catch (error) {
      console.error('Error activating voice bot:', error);
      alert('Failed to start voice bot. Please try again.');
    }
  }

  // Load VAPI SDK dynamically
  function loadVapiSDK() {
    return new Promise((resolve, reject) => {
      if (window.vapiSDK) {
        resolve(window.vapiSDK);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js';
      script.onload = () => {
        console.log('✅ VAPI SDK loaded successfully');
        // Wait a bit for the SDK to initialize
        setTimeout(() => {
          if (window.vapiSDK) {
            resolve(window.vapiSDK);
          } else {
            reject(new Error('VAPI SDK not available after loading'));
          }
        }, 100);
      };
      script.onerror = (error) => {
        console.error('❌ Failed to load VAPI SDK:', error);
        reject(error);
      };

      document.head.appendChild(script);
    });
  }
  
  // Process voice commands for navigation
  function processVoiceCommand(transcript) {
    console.log("🎤 Processing voice command:", transcript);

    const command = transcript.toLowerCase();

    // Website navigation commands
    if (command.includes("open google") || command.includes("go to google")) {
      handleNavigation("https://www.google.com");
      return true;
    }
    if (command.includes("open youtube") || command.includes("go to youtube")) {
      handleNavigation("https://www.youtube.com");
      return true;
    }
    if (command.includes("open facebook") || command.includes("go to facebook")) {
      handleNavigation("https://www.facebook.com");
      return true;
    }
    if (command.includes("open twitter") || command.includes("go to twitter")) {
      handleNavigation("https://www.twitter.com");
      return true;
    }
    if (command.includes("open github") || command.includes("go to github")) {
      handleNavigation("https://www.github.com");
      return true;
    }

    // General navigation
    const goToMatch = command.match(/(?:go to|open|navigate to|visit)\\s+(?:the\\s+)?(?:website\\s+)?([a-z0-9\\-\\.]+\\.[a-z]{2,})/i);
    if (goToMatch && goToMatch[1]) {
      handleNavigation("https://" + goToMatch[1]);
      return true;
    }

    // Search functionality
    const searchMatch = command.match(/search\\s+(?:for|about)?\\s+(.+)/i);
    if (searchMatch && searchMatch[1]) {
      const searchQuery = searchMatch[1].trim();
      if (searchQuery) {
        const searchUrl = "https://www.google.com/search?q=" + encodeURIComponent(searchQuery);
        handleNavigation(searchUrl);
        return true;
      }
    }

    // URL detection
    const urlMatch = transcript.match(/(?:https?:\\/\\/)?(?:www\\.)?([a-z0-9\\-\\.]+\\.[a-z]{2,}(?:\\/\\S*)?)/i);
    if (urlMatch) {
      let url = urlMatch[0];
      if (!url.startsWith("http")) {
        url = "https://" + url;
      }
      handleNavigation(url);
      return true;
    }

    return false;
  }

  // Navigation handler function
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

      // Announce navigation if VAPI instance is available
      if (window.vapiInstance) {
        window.vapiInstance.say("Opening the requested website for you!", false);
      }

      // Navigate to the URL after a short delay
      console.log('🌐 Navigating to:', url);
      setTimeout(() => {
        window.open(url, "_blank");
      }, 1500);

      return true;
    } catch (error) {
      console.error('Navigation error:', error);
      return false;
    }
  }

  // Setup VAPI event listeners with navigation functionality
  function setupVapiEventListeners() {
    if (!window.vapiInstance) {
      console.error('❌ VAPI instance not available');
      return;
    }

    const welcomeMessage = "Hello! I'm your voice assistant. I can help you navigate websites, search the internet, or answer questions. Try saying 'Open Google', 'Search for cats', or 'Go to YouTube'!";

    window.vapiInstance.on('call-start', () => {
      console.log('✅ Voice bot call started');

      // Announce capabilities when call starts
      setTimeout(() => {
        window.vapiInstance.say(welcomeMessage, false);
      }, 1000);
    });

    window.vapiInstance.on('call-end', () => {
      console.log('✅ Voice bot call ended');
    });

    window.vapiInstance.on('speech-start', () => {
      console.log('🎤 User started speaking');
    });

    window.vapiInstance.on('speech-end', () => {
      console.log('🎤 User stopped speaking');
    });

    window.vapiInstance.on('message', (message) => {
      console.log('📨 Message received:', message);

      // Check for transcript messages
      if (message.type === 'transcript' && message.role === 'user') {
        const transcript = message.transcript || message.transcriptPartial;
        if (transcript) {
          // Process navigation commands
          const handled = processVoiceCommand(transcript);
          if (handled) {
            console.log('✅ Navigation command processed successfully');
          }
        }
      }
    });

    window.vapiInstance.on('error', (error) => {
      console.error('❌ VAPI error:', error);
    });

    console.log('✅ VAPI event listeners setup complete');
  }

  // Setup session-isolated Supabase listener for function calls
  function setupSupabaseListener(sessionId) {
    console.log('🔗 Setting up session-isolated Supabase listener for session:', sessionId);
    
    // Create Supabase client
    const SUPABASE_URL = 'https://mdkcdjltvfpthqudhhmx.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NDU3NTAsImV4cCI6MjA2OTUyMTc1MH0.YJAf_8-6tKTXp00h7liGNLvYC_-vJ4ttonAxP3ySvOg';
    
    // Dynamically load Supabase if not already loaded
    if (!window.supabase) {
      loadSupabaseSDK().then(() => {
        setupSessionChannel(sessionId);
      }).catch(error => {
        console.error('Failed to load Supabase SDK:', error);
      });
    } else {
      setupSessionChannel(sessionId);
    }
  }

  function loadSupabaseSDK() {
    return new Promise((resolve, reject) => {
      if (window.supabase) {
        resolve(window.supabase);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      script.onload = () => {
        console.log('✅ Supabase SDK loaded successfully');
        const { createClient } = window.supabase;
        window.supabaseClient = createClient(
          'https://mdkcdjltvfpthqudhhmx.supabase.co',
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NDU3NTAsImV4cCI6MjA2OTUyMTc1MH0.YJAf_8-6tKTXp00h7liGNLvYC_-vJ4ttonAxP3ySvOg'
        );
        resolve(window.supabaseClient);
      };
      script.onerror = (error) => {
        console.error('❌ Failed to load Supabase SDK:', error);
        reject(error);
      };
      document.head.appendChild(script);
    });
  }

  function setupSessionChannel(sessionId) {
    if (!window.supabaseClient) {
      console.error('Supabase client not available');
      return;
    }

    console.log('🔗 Subscribing to session-specific channel:', \`vapi:session:\${sessionId}\`);
    
    const channel = window.supabaseClient
      .channel(\`vapi:session:\${sessionId}\`)
      .on('broadcast', { event: 'function_call' }, (payload) => {
        console.log('📨 Session-isolated function call received:', payload);
        
        // Verify this is for our session
        if (payload.payload.sessionId === sessionId) {
          handleFunctionCall(payload.payload);
        } else {
          console.warn('⚠️ Received function call for different session, ignoring');
        }
      })
      .subscribe((status) => {
        console.log('📡 Session channel subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to session-specific function calls');
        }
      });

    // Store channel reference for cleanup
    window.sessionChannel = channel;
  }

  function handleFunctionCall(functionCall) {
    console.log('🔧 Handling session-isolated function call:', functionCall);
    
    const { functionName, params, callId, sessionId } = functionCall;
    
    switch (functionName) {
      case 'scroll_page':
        handleScrollPage(params);
        break;
      case 'click_element':
        handleClickElement(params);
        break;
      case 'fill_field':
        handleFillField(params);
        break;
      case 'toggle_element':
        handleToggleElement(params);
        break;
      default:
        console.warn('Unknown function call:', functionName);
    }
  }

  function handleScrollPage(params) {
    console.log('📜 Executing scroll_page:', params);
    const direction = params.direction || 'down';
    const scrollAmount = window.innerHeight * 0.8;

    switch(direction) {
      case 'up':
        window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
        break;
      case 'down':
        window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        break;
      case 'top':
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'bottom':
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        break;
    }
  }

  function handleClickElement(params) {
    console.log('🖱️ Executing click_element:', params);
    const selector = params.selector;
    if (!selector) return;

    try {
      const element = document.querySelector(selector);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          element.click();
        }, 500);
      } else {
        console.warn('Element not found:', selector);
      }
    } catch (error) {
      console.error('Click element error:', error);
    }
  }

  function handleFillField(params) {
    console.log('✏️ Executing fill_field:', params);
    const { selector, value } = params;
    if (!selector || value === undefined) return;

    try {
      const element = document.querySelector(selector);
      if (element) {
        element.focus();
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        console.warn('Input field not found:', selector);
      }
    } catch (error) {
      console.error('Fill field error:', error);
    }
  }

  function handleToggleElement(params) {
    console.log('🔄 Executing toggle_element:', params);
    const selector = params.selector;
    if (!selector) return;

    try {
      const element = document.querySelector(selector);
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = !element.checked;
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          element.click();
        }
      } else {
        console.warn('Toggle element not found:', selector);
      }
    } catch (error) {
      console.error('Toggle element error:', error);
    }
  }

  // Setup message listener for navigation commands (legacy)
  function setupMessageListener() {
    window.addEventListener('message', function(event) {
      if (event.origin !== chatbotHostOrigin) return;
      
      if (event.data && event.data.type === 'navigate') {
        const success = handleNavigation(event.data.url);
        
        // Send navigation result back to VAPI
        fetch(\`\${chatbotHostOrigin}/api/vapi/navigation\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: event.data.url,
            command: event.data.command || 'navigate',
            success: success,
            botUuid: chatBotUuid
          })
        }).catch(error => {
          console.error('Failed to log navigation:', error);
        });
      }
    });
  }
  
  console.log('🤖 VAPI Voice Bot script loaded successfully');
})();`;
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      fontFamily: 'monospace',
      background: '#f8f9fa'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '18px', marginBottom: '20px' }}>📄 Voice Assistant JavaScript File</div>
        <div style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
          This page should be loaded as a JavaScript file in your website.
        </div>
        <div style={{ 
          background: '#1a1a1a', 
          color: '#00ff00', 
          padding: '10px', 
          borderRadius: '5px',
          fontFamily: 'monospace',
          fontSize: '12px',
          textAlign: 'left',
          maxWidth: '600px'
        }}>
          {`<script 
  defer
  src="${window.location.origin}/js/external-chatbot-voice.js"
  data-chatbot-uuid="your-assistant-id"
  data-language="en"
  data-position="right"
  data-theme="light">
</script>`}
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistantEmbedJS;