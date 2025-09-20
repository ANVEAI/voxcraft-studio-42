import { useEffect } from 'react';

const JavaScriptEmbed = () => {
  useEffect(() => {
    // Get the JavaScript content
    const jsContent = `(async function() {
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeVoiceBot);
  } else {
    initializeVoiceBot();
  }
  
  function initializeVoiceBot() {
    console.log('Initializing voice bot...');
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
      </div>
    \`;
    
    document.body.insertAdjacentHTML('beforeend', widgetMarkup);

    // Add hover effects for pending widget
    const widget = document.getElementById('vapi-bot-widget');
    
    if (widget) {
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
      if (!window.Vapi) {
        await loadVapiSDK();
      }

      // Initialize VAPI with the bot's assistant ID
      if (window.Vapi && window.botInfo.vapiAssistantId) {
        console.log('🚀 Starting VAPI with assistant:', window.botInfo.vapiAssistantId);

        // Get VAPI public key
        const vapiPublicKey = '${import.meta.env.VITE_VAPI_PUBLIC_KEY}';
        
        // Configure for embedded/cross-origin environments
        const vapiConfig = {
          // Disable advanced audio processing for cross-origin compatibility
          audioConfig: {
            enableEchoCancellation: true,
            enableNoiseSuppression: false,
            enableAutoGainControl: true
          }
        };
        
        // Initialize VAPI instance
        const vapi = new window.Vapi(vapiPublicKey);
        
        // Start the call with embedded-specific configuration
        await vapi.start({
          assistantId: window.botInfo.vapiAssistantId,
          config: vapiConfig
        });

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
      if (window.Vapi) {
        resolve(window.Vapi);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@vapi-ai/web@latest/dist/index.js';
      script.onload = () => {
        console.log('✅ VAPI SDK loaded successfully');
        // Wait a bit for the SDK to initialize
        setTimeout(() => {
          if (window.Vapi) {
            resolve(window.Vapi);
          } else {
            reject(new Error('VAPI SDK not available after loading'));
          }
        }, 500);
      };
      script.onerror = (error) => {
        console.error('❌ Failed to load VAPI SDK:', error);
        reject(error);
      };

      document.head.appendChild(script);
    });
  }
  
  console.log('🤖 VAPI Voice Bot script loaded successfully');
})();`;

    // Replace the page content with pure JavaScript
    document.open();
    document.write(jsContent);
    document.close();
  }, []);

  // Fallback content - this won't be shown since we replace the document
  return (
    <div style={{ 
      fontFamily: 'monospace',
      padding: '20px',
      background: '#f8f9fa'
    }}>
      <h2>Voice Assistant JavaScript Loading...</h2>
      <p>If you see this message, please refresh the page.</p>
    </div>
  );
};

export default JavaScriptEmbed;