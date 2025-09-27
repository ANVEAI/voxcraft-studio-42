import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[FRAME] Request received:', req.method, req.url);
  
  const url = new URL(req.url);
  const assistantId = url.searchParams.get('assistantId');
  const vapiAssistantId = url.searchParams.get('vapiAssistantId');
  const position = url.searchParams.get('position') || 'right';
  const theme = url.searchParams.get('theme') || 'light';
  const language = url.searchParams.get('language') || 'en';

  console.log('[FRAME] Parameters:', { assistantId, vapiAssistantId, position, theme });

  if (!assistantId || !vapiAssistantId) {
    console.error('[FRAME] Missing required parameters');
    const errorContent = `
<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body style="display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: Arial;">
  <div style="text-align: center; color: #ff0000;">
    <h3>Configuration Error</h3>
    <p>Missing assistantId or vapiAssistantId</p>
  </div>
</body>
</html>`;
    return new Response(errorContent, { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'text/html' }
    });
  }

  const frameContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' https:; script-src 'self' 'unsafe-inline' https://vapi.ai; style-src 'self' 'unsafe-inline'; connect-src 'self' https: wss: data:; media-src 'self' https: data:; font-src 'self' https: data:;">
  <title>VoiceAI Assistant</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      width: 100%;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }
    
    #assistant-button {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: none;
      background: ${theme === 'dark' ? '#1f2937' : '#3b82f6'};
      color: white;
      font-size: 24px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    #assistant-button:hover {
      transform: scale(1.1);
    }
    
    #assistant-button.active {
      background: #ef4444;
      animation: pulse 2s infinite;
    }
    
    #assistant-button.listening {
      background: #f59e0b;
    }
    
    .permission-prompt {
      position: absolute;
      top: -60px;
      right: 0;
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 12px;
      color: #666;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
      z-index: 10001;
    }
    
    .permission-prompt.show {
      opacity: 1;
      visibility: visible;
    }
    
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
      100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
    }
  </style>
</head>
<body>
  <div style="position: relative;">
    <button id="assistant-button">🎤</button>
    <div id="permission-prompt" class="permission-prompt">Click to enable microphone</div>
  </div>
  
  <script src="https://cdn.jsdelivr.net/npm/@vapi-ai/web@latest/dist/index.js"></script>
  <script>
    console.log('[FRAME] Voice assistant frame loading...');
    
    let isActive = false;
    let vapi = null;
    const button = document.getElementById('assistant-button');
    
    // Initialize conversation memory
    const MEMORY_KEY = 'voiceai-conversation-${assistantId}';
    let conversationMemory = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
    
    // Send styling information to parent
    function sendStyling() {
      const styles = {
        '--voiceai-window-w': '70px',
        '--voiceai-window-h': '70px',
        '--voiceai-box-radius': '50%'
      };
      
      const attrs = {
        'frame-x-pos': '${position}'
      };
      
      window.parent.postMessage({
        type: 'voiceai-assistant-response-styling',
        data: { styles, attrs }
      }, '*');
    }
    
    // Listen for styling requests from parent
    window.addEventListener('message', (event) => {
      if (event.data.type === 'voiceai-assistant-request-styling') {
        sendStyling();
      }
    });
    
    // Website Navigation System
    const NavigationSystem = {
      scrollTo: function(direction, amount = 500) {
        window.parent.postMessage({
          type: 'voiceai-navigate',
          action: 'scroll',
          data: { direction, amount }
        }, '*');
      },
      
      navigateToSection: function(sectionName) {
        window.parent.postMessage({
          type: 'voiceai-navigate',
          action: 'section',
          data: { sectionName }
        }, '*');
      },
      
      clickElement: function(elementText) {
        window.parent.postMessage({
          type: 'voiceai-navigate',
          action: 'click',
          data: { elementText }
        }, '*');
      }
    };
    
    // Initialize VAPI when available
    function initializeVAPI() {
      if (window.Vapi) {
        console.log('[FRAME] Creating VAPI instance with ID:', '${vapiAssistantId}');
        
        // Initialize VAPI with cross-origin compatible settings
        vapi = new window.Vapi('${import.meta.env.VITE_VAPI_PUBLIC_KEY}');
        
        // Configure for embedded/cross-origin environments
        const vapiConfig = {
          // Disable advanced audio processing for cross-origin compatibility
          audioConfig: {
            enableEchoCancellation: true,
            enableNoiseSuppression: false,
            enableAutoGainControl: true
          }
        };
        
        // Request microphone permission on first click
        let hasRequestedPermission = false;
        
        // Button click handler
        button.onclick = async function() {
          console.log('[FRAME] Button clicked, isActive:', isActive);
          
          // Request microphone permission if not already requested
          if (!hasRequestedPermission) {
            try {
              const permissionPrompt = document.getElementById('permission-prompt');
              permissionPrompt.classList.add('show');
              
              console.log('[FRAME] Requesting microphone permission...');
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              console.log('[FRAME] Microphone permission granted');
              stream.getTracks().forEach(track => track.stop()); // Stop the test stream
              hasRequestedPermission = true;
              permissionPrompt.classList.remove('show');
            } catch (error) {
              console.error('[FRAME] Microphone permission denied:', error);
              const permissionPrompt = document.getElementById('permission-prompt');
              permissionPrompt.textContent = 'Microphone access required';
              permissionPrompt.style.background = '#fef2f2';
              permissionPrompt.style.color = '#dc2626';
              permissionPrompt.style.borderColor = '#fca5a5';
              return;
            }
          }
          
          if (!isActive && vapi) {
            const memoryContext = conversationMemory.length > 0 
              ? 'Previous conversation context: ' + conversationMemory.slice(-5).map(m => \`\${m.role}: \${m.content}\`).join(' | ')
              : '';
            
            console.log('[FRAME] Starting conversation with memory context');
            vapi.start('${vapiAssistantId}', {
              systemMessage: memoryContext,
              // Embedded-specific configuration
              config: vapiConfig,
              // Disable Krisp to prevent WORKLET_NOT_SUPPORTED errors
              backgroundDenoisingEnabled: false
            });
          } else if (isActive && vapi) {
            console.log('[FRAME] Stopping conversation');
            vapi.stop();
          }
        };
        
        // VAPI event listeners
        vapi.on('call-start', () => {
          console.log('[FRAME] Conversation started');
          isActive = true;
          button.className = 'active';
          button.innerHTML = '🔴';
        });
        
        vapi.on('call-end', () => {
          console.log('[FRAME] Conversation ended');
          isActive = false;
          button.className = '';
          button.innerHTML = '🎤';
        });
        
        vapi.on('speech-start', () => {
          console.log('[FRAME] Speech started');
          button.className = 'listening';
          button.innerHTML = '👂';
        });
        
        vapi.on('speech-end', () => {
          console.log('[FRAME] Speech ended');
          button.className = isActive ? 'active' : '';
          button.innerHTML = isActive ? '🔴' : '🎤';
        });
        
        vapi.on('error', (error) => {
          console.error('[FRAME] VAPI Error:', error);
          isActive = false;
          button.className = '';
          button.innerHTML = '🎤';
          
          // Handle specific error types
          if (error.message?.includes('Meeting has ended') || error.message?.includes('ejected')) {
            console.log('[FRAME] Call was terminated, attempting reconnect...');
            setTimeout(() => {
              if (!isActive && vapi) {
                console.log('[FRAME] Auto-reconnecting after ejection...');
                vapi.start('${vapiAssistantId}', { 
                  config: vapiConfig,
                  backgroundDenoisingEnabled: false 
                });
              }
            }, 2000);
          }
        });
        
        vapi.on('message', (message) => {
          console.log('[FRAME] Received message:', message);
          
          if (message.type === 'assistant-response') {
            conversationMemory.push({
              role: 'assistant',
              content: message.content,
              timestamp: new Date().toISOString()
            });
            
            const content = message.content.toLowerCase();
            
            // Handle navigation commands
            if (content.includes('scroll down') || content.includes('go down')) {
              NavigationSystem.scrollTo('down');
            } else if (content.includes('scroll up') || content.includes('go up')) {
              NavigationSystem.scrollTo('up');
            }
            
            const sectionMatch = content.match(/(?:go to|navigate to|show me|find)\\s+([\\w\\s]+?)\\s+(?:section|page|area)/);
            if (sectionMatch) {
              NavigationSystem.navigateToSection(sectionMatch[1].trim());
            }
            
            const clickMatch = content.match(/(?:click|press|select)\\s+([\\w\\s]+?)\\s+(?:button|link|element)/);
            if (clickMatch) {
              NavigationSystem.clickElement(clickMatch[1].trim());
            }
            
            // Manage memory size
            if (conversationMemory.length > 20) {
              conversationMemory = conversationMemory.slice(-20);
            }
            
            localStorage.setItem(MEMORY_KEY, JSON.stringify(conversationMemory));
          }
          
          if (message.type === 'user-transcript') {
            conversationMemory.push({
              role: 'user',
              content: message.content,
              timestamp: new Date().toISOString()
            });
          }
        });
        
        console.log('[FRAME] VAPI initialized successfully');
      } else {
        console.error('[FRAME] VAPI SDK not found');
        button.onclick = function() {
          alert('Voice assistant is not available. VAPI SDK failed to load.');
        };
      }
    }
    
    // Wait for VAPI to load or initialize immediately if already loaded
    if (window.Vapi) {
      initializeVAPI();
    } else {
      // Wait for VAPI script to load
      const checkVapi = setInterval(() => {
        if (window.Vapi) {
          clearInterval(checkVapi);
          initializeVAPI();
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkVapi);
        if (!window.Vapi) {
          console.error('[FRAME] VAPI SDK failed to load within timeout');
          button.onclick = function() {
            alert('Voice assistant is not available. VAPI SDK failed to load.');
          };
        }
      }, 10000);
    }
    
    // Add navigation handlers to parent window
    window.addEventListener('load', () => {
      window.parent.postMessage({
        type: 'voiceai-add-navigation-handlers'
      }, '*');
    });
    
    console.log('[FRAME] Voice assistant frame ready');
  </script>
</body>
</html>`;

  return new Response(frameContent, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=3600',
      'X-Frame-Options': 'SAMEORIGIN'
    },
  });
});