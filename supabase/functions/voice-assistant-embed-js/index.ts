import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[EMBED JS] Request received:', req.method, req.url);
  
  const url = new URL(req.url);
  const assistant = url.searchParams.get('assistant') || 'default-assistant';
  const apiKey = url.searchParams.get('apiKey') || '';
  const position = url.searchParams.get('position') || 'bottom-right';
  const theme = url.searchParams.get('theme') || 'light';
  
  console.log('[EMBED JS] Parameters:', { assistant, position, theme });

  const jsContent = `(function() {
  'use strict';
  
  console.log('[CustomVoiceWidget] Initializing with config:', {
    assistant: "${assistant}",
    position: "${position}",
    theme: "${theme}"
  });

  const CONFIG = {
    assistantId: "${assistant}",
    publicKey: "${apiKey}",
    position: "${position}",
    theme: "${theme}"
  };

  class CustomVoiceWidget {
    constructor(config) {
      this.config = config;
      this.vapi = null;
      this.isActive = false;
      this.isMuted = false;
      this.volumeLevel = 0;
      this.transcripts = [];
      this.container = null;
      this.state = 'idle';
      
      this.init();
    }

    init() {
      this.createWidget();
      this.loadVapiSDK();
    }

    createWidget() {
      this.container = document.createElement('div');
      this.container.id = 'custom-voice-widget';
      this.container.style.cssText = \`
        position: fixed;
        \${this.config.position.includes('left') ? 'left: 20px' : 'right: 20px'};
        bottom: 20px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      \`;

      const isDark = this.config.theme === 'dark';
      const bgColor = isDark ? '#1f2937' : 'white';
      const textColor = isDark ? '#f9fafb' : '#111827';
      const borderColor = isDark ? '#374151' : '#e5e7eb';

      const card = document.createElement('div');
      card.id = 'voice-widget-card';
      card.style.cssText = \`
        background: \${bgColor};
        color: \${textColor};
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        width: 320px;
        max-height: 500px;
        display: none;
        flex-direction: column;
        overflow: hidden;
        margin-bottom: 10px;
      \`;

      const header = document.createElement('div');
      header.style.cssText = \`
        padding: 16px;
        border-bottom: 1px solid \${borderColor};
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      \`;
      header.innerHTML = \`
        <span style="font-weight: 600; font-size: 16px;">Voice Assistant</span>
        <button id="close-widget" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px; padding: 0; width: 24px; height: 24px;">×</button>
      \`;

      const status = document.createElement('div');
      status.id = 'voice-status';
      status.style.cssText = \`
        padding: 12px 16px;
        background: \${isDark ? '#374151' : '#f3f4f6'};
        border-bottom: 1px solid \${borderColor};
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        color: \${isDark ? '#d1d5db' : '#6b7280'};
      \`;
      status.innerHTML = \`
        <div id="status-icon" style="width: 8px; height: 8px; border-radius: 50%; background: #9ca3af;"></div>
        <span id="status-text">Disconnected</span>
      \`;

      const visualizer = document.createElement('div');
      visualizer.id = 'audio-visualizer';
      visualizer.style.cssText = \`
        padding: 24px;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 4px;
        height: 80px;
        background: \${isDark ? '#111827' : 'linear-gradient(180deg, #f9fafb 0%, #ffffff 100%)'};
      \`;
      
      for (let i = 0; i < 5; i++) {
        const bar = document.createElement('div');
        bar.className = 'visualizer-bar';
        bar.style.cssText = \`
          width: 4px;
          height: 20%;
          background: #d1d5db;
          border-radius: 2px;
          transition: all 0.15s ease;
        \`;
        visualizer.appendChild(bar);
      }

      const transcripts = document.createElement('div');
      transcripts.id = 'transcripts';
      transcripts.style.cssText = \`
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        max-height: 200px;
        font-size: 14px;
      \`;
      transcripts.innerHTML = '<p style="color: #9ca3af; text-align: center;">Transcripts will appear here...</p>';

      const controls = document.createElement('div');
      controls.id = 'voice-controls';
      controls.style.cssText = \`
        padding: 16px;
        border-top: 1px solid \${borderColor};
        display: flex;
        gap: 8px;
        justify-content: center;
      \`;

      const startBtn = document.createElement('button');
      startBtn.id = 'start-call-btn';
      startBtn.style.cssText = \`
        flex: 1;
        padding: 12px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s;
        opacity: 0.5;
      \`;
      startBtn.textContent = 'Loading...';
      startBtn.disabled = true;

      const muteBtn = document.createElement('button');
      muteBtn.id = 'mute-btn';
      muteBtn.style.cssText = \`
        padding: 12px 16px;
        background: \${isDark ? '#374151' : '#f3f4f6'};
        border: 1px solid \${borderColor};
        border-radius: 8px;
        cursor: pointer;
        display: none;
      \`;
      muteBtn.innerHTML = '🎤';

      controls.appendChild(startBtn);
      controls.appendChild(muteBtn);

      card.appendChild(header);
      card.appendChild(status);
      card.appendChild(visualizer);
      card.appendChild(transcripts);
      card.appendChild(controls);

      const floatingBtn = document.createElement('button');
      floatingBtn.id = 'floating-voice-btn';
      floatingBtn.style.cssText = \`
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.3s;
      \`;
      floatingBtn.innerHTML = '🎤';

      this.container.appendChild(card);
      this.container.appendChild(floatingBtn);
      document.body.appendChild(this.container);

      this.setupEventListeners();
    }

    setupEventListeners() {
      const floatingBtn = document.getElementById('floating-voice-btn');
      const card = document.getElementById('voice-widget-card');
      const closeBtn = document.getElementById('close-widget');
      const startBtn = document.getElementById('start-call-btn');
      const muteBtn = document.getElementById('mute-btn');

      floatingBtn.addEventListener('click', () => {
        const isVisible = card.style.display === 'flex';
        card.style.display = isVisible ? 'none' : 'flex';
      });

      floatingBtn.addEventListener('mouseenter', () => {
        floatingBtn.style.transform = 'scale(1.1)';
      });

      floatingBtn.addEventListener('mouseleave', () => {
        floatingBtn.style.transform = 'scale(1)';
      });

      closeBtn.addEventListener('click', () => {
        card.style.display = 'none';
      });

      startBtn.addEventListener('click', () => {
        if (!this.isActive) {
          this.startCall();
        } else {
          this.endCall();
        }
      });

      muteBtn.addEventListener('click', () => {
        this.toggleMute();
      });
    }

    async loadVapiSDK() {
      console.log('[CustomVoiceWidget] Loading Vapi SDK...');
      
      if (window.Vapi) {
        console.log('[CustomVoiceWidget] Vapi SDK already loaded');
        this.initializeVapi();
        return;
      }

      // Try multiple CDN URLs and path variants
      const cdnUrls = [
        'https://cdn.jsdelivr.net/npm/@vapi-ai/web@2.3.8/dist/index.umd.js',
        'https://cdn.jsdelivr.net/npm/@vapi-ai/web@2.3.8/dist/index.global.js',
        'https://cdn.jsdelivr.net/npm/@vapi-ai/web@2.3.8/dist/index.js',
        'https://unpkg.com/@vapi-ai/web@2.3.8/dist/index.umd.js',
        'https://unpkg.com/@vapi-ai/web@2.3.8/dist/index.js',
        'https://cdn.jsdelivr.net/npm/@vapi-ai/web@latest/dist/index.umd.js',
        'https://cdn.jsdelivr.net/npm/@vapi-ai/web@latest/dist/index.js'
      ];

      const loadTimeout = 15000; // 15 seconds

      const tryLoadScript = (url) => {
        return new Promise((resolve, reject) => {
          console.log('[CustomVoiceWidget] Attempting to load from:', url);
          
          const script = document.createElement('script');
          script.src = url;
          script.crossOrigin = 'anonymous';
          
          const timeoutId = setTimeout(() => {
            console.error('[CustomVoiceWidget] SDK load timeout for:', url);
            script.remove();
            reject(new Error('Load timeout'));
          }, loadTimeout);

          script.onload = () => {
            clearTimeout(timeoutId);
            if (window.Vapi) {
              console.log('[CustomVoiceWidget] ✓ SDK loaded successfully from:', url);
              resolve(url);
            } else {
              console.warn('[CustomVoiceWidget] Script loaded but window.Vapi not found:', url);
              script.remove();
              reject(new Error('Vapi not found'));
            }
          };

          script.onerror = (error) => {
            console.error('[CustomVoiceWidget] SDK load error from:', url, error);
            clearTimeout(timeoutId);
            script.remove();
            reject(error);
          };

          document.head.appendChild(script);
        });
      };

      // Try ESM import as fallback
      const tryESMImport = async () => {
        try {
          console.log('[CustomVoiceWidget] Attempting ESM import...');
          const module = await import('https://cdn.jsdelivr.net/npm/@vapi-ai/web@2.3.8/+esm');
          
          // Try different export patterns
          let VapiConstructor = null;
          if (typeof module.default === 'function') {
            VapiConstructor = module.default;
          } else if (module.default && typeof module.default.default === 'function') {
            VapiConstructor = module.default.default;
          } else if (typeof module.Vapi === 'function') {
            VapiConstructor = module.Vapi;
          }
          
          if (VapiConstructor) {
            window.Vapi = VapiConstructor;
            console.log('[CustomVoiceWidget] ✓ Vapi loaded via ESM import');
            return true;
          } else {
            console.error('[CustomVoiceWidget] No valid Vapi constructor found in ESM module');
          }
        } catch (error) {
          console.error('[CustomVoiceWidget] ESM import failed:', error);
        }
        return false;
      };

      // Try all script URLs
      let loaded = false;
      for (const url of cdnUrls) {
        try {
          await tryLoadScript(url);
          if (window.Vapi) {
            loaded = true;
            break;
          }
        } catch (error) {
          console.warn('[CustomVoiceWidget] Failed to load from:', url);
        }
      }

      // If script loading failed, try ESM import
      if (!loaded) {
        console.log('[CustomVoiceWidget] All script attempts failed, trying ESM import...');
        loaded = await tryESMImport();
      }

      // Initialize or show error
      if (loaded && window.Vapi) {
        console.log('[CustomVoiceWidget] Vapi SDK ready, initializing...');
        this.initializeVapi();
      } else {
        console.error('[CustomVoiceWidget] ✗ All SDK loading attempts failed');
        this.updateState('error', 'Failed to load voice SDK');
        const startBtn = document.getElementById('start-call-btn');
        if (startBtn) {
          startBtn.textContent = 'SDK Load Failed';
          startBtn.disabled = true;
          startBtn.style.opacity = '0.5';
        }
      }
    }

    initializeVapi() {
      console.log('[CustomVoiceWidget] Initializing Vapi with key:', this.config.publicKey ? 'Present' : 'Missing');
      
      try {
        if (!this.config.publicKey) {
          throw new Error('Missing API key');
        }
        
        this.vapi = new window.Vapi(this.config.publicKey);
        console.log('[CustomVoiceWidget] Vapi instance created');
        
        this.setupVapiEvents();
        this.updateState('idle', 'Ready');
        this.enableStartButton();
        console.log('[CustomVoiceWidget] Initialization complete');
      } catch (error) {
        console.error('[CustomVoiceWidget] Init error:', error);
        this.updateState('error', 'Initialization failed');
        const startBtn = document.getElementById('start-call-btn');
        if (startBtn) {
          startBtn.textContent = 'Error';
          startBtn.disabled = true;
        }
      }
    }

    enableStartButton() {
      const startBtn = document.getElementById('start-call-btn');
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = 'Start Call';
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';
      }
    }

    setupVapiEvents() {
      this.vapi.on('call-start', () => {
        this.isActive = true;
        this.updateState('connected', 'Connected');
        this.updateControls();
      });

      this.vapi.on('call-end', () => {
        this.isActive = false;
        this.updateState('idle', 'Call ended');
        this.updateControls();
      });

      this.vapi.on('speech-start', () => {
        this.updateState('listening', 'Listening...');
      });

      this.vapi.on('speech-end', () => {
        this.updateState('connected', 'Connected');
      });

      this.vapi.on('message', (message) => {
        if (message.type === 'transcript' && message.transcriptType === 'final') {
          this.addTranscript(message.role, message.transcript);
        }
      });

      this.vapi.on('error', (error) => {
        console.error('[CustomVoiceWidget] Vapi Error Event:', error);
        
        // Extract detailed error information
        let errorMessage = 'Error occurred';
        if (error?.error?.error) {
          console.error('[CustomVoiceWidget] API Error Details:', error.error.error);
          errorMessage = error.error.error.message || errorMessage;
        }
        
        // Check for specific error types
        if (error?.type === 'start-method-error') {
          if (error?.error?.status === 400) {
            errorMessage = 'Invalid assistant or API key';
          } else if (error?.error?.status === 401) {
            errorMessage = 'Authentication failed';
          } else if (error?.error?.status === 404) {
            errorMessage = 'Assistant not found';
          }
        }
        
        this.updateState('error', errorMessage);
      });

      setInterval(() => {
        if (this.isActive) {
          this.volumeLevel = Math.random() * 100;
          this.updateVisualizer();
        }
      }, 100);
    }

    async startCall() {
      console.log('[CustomVoiceWidget] Starting call...', { 
        vapi: !!this.vapi, 
        assistantId: this.config.assistantId,
        publicKey: this.config.publicKey ? this.config.publicKey.substring(0, 8) + '***' : 'Missing'
      });
      
      if (!this.vapi) {
        console.error('[CustomVoiceWidget] Vapi not initialized');
        this.updateState('error', 'Voice service not ready');
        return;
      }

      // Validate assistant ID format (should be a UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(this.config.assistantId)) {
        console.error('[CustomVoiceWidget] Invalid assistant ID format:', this.config.assistantId);
        this.updateState('error', 'Invalid assistant ID');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        
        this.updateState('connecting', 'Connecting...');
        
        const callConfig = {
          assistantId: this.config.assistantId,
          backgroundDenoisingEnabled: false
        };
        
        console.log('[CustomVoiceWidget] Starting Vapi call with config:', callConfig);
        
        await this.vapi.start(callConfig);
        console.log('[CustomVoiceWidget] Call started successfully');
      } catch (error) {
        console.error('[CustomVoiceWidget] Start call error:', error);
        console.error('[CustomVoiceWidget] Error details:', {
          message: error?.message,
          response: error?.response,
          status: error?.status
        });
        
        let errorMessage = 'Failed to start call';
        if (error?.message?.includes('permission')) {
          errorMessage = 'Microphone permission denied';
        }
        
        this.updateState('error', errorMessage);
      }
    }

    endCall() {
      if (this.vapi) {
        this.vapi.stop();
      }
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      if (this.vapi && this.vapi.setMuted) {
        this.vapi.setMuted(this.isMuted);
      }
      const muteBtn = document.getElementById('mute-btn');
      muteBtn.innerHTML = this.isMuted ? '🔇' : '🎤';
    }

    updateState(state, statusText) {
      this.state = state;
      const statusIcon = document.getElementById('status-icon');
      const statusTextEl = document.getElementById('status-text');
      
      const stateColors = {
        idle: '#9ca3af',
        connecting: '#f59e0b',
        connected: '#10b981',
        listening: '#3b82f6',
        speaking: '#8b5cf6',
        error: '#ef4444'
      };

      statusIcon.style.background = stateColors[state] || '#9ca3af';
      statusTextEl.textContent = statusText;
    }

    updateControls() {
      const startBtn = document.getElementById('start-call-btn');
      const muteBtn = document.getElementById('mute-btn');

      if (this.isActive) {
        startBtn.textContent = 'End Call';
        startBtn.style.background = '#ef4444';
        muteBtn.style.display = 'block';
      } else {
        startBtn.textContent = 'Start Call';
        startBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        muteBtn.style.display = 'none';
      }
    }

    updateVisualizer() {
      const bars = document.querySelectorAll('.visualizer-bar');
      bars.forEach((bar, i) => {
        const height = 20 + (this.volumeLevel / 100) * 60 + Math.sin(i + this.volumeLevel * 0.1) * 10;
        bar.style.height = height + '%';
        bar.style.background = this.isActive ? '#667eea' : '#d1d5db';
      });
    }

    addTranscript(role, content) {
      const transcriptsDiv = document.getElementById('transcripts');
      const messageDiv = document.createElement('div');
      messageDiv.style.cssText = \`
        margin-bottom: 12px;
        padding: 8px 12px;
        border-radius: 8px;
        background: \${role === 'user' ? '#eff6ff' : '#f3f4f6'};
      \`;
      messageDiv.innerHTML = \`
        <div style="font-weight: 600; font-size: 12px; color: #6b7280; margin-bottom: 4px;">\${role === 'user' ? 'You' : 'Assistant'}</div>
        <div style="color: #374151;">\${content}</div>
      \`;
      
      if (transcriptsDiv.firstChild?.textContent?.includes('will appear here')) {
        transcriptsDiv.innerHTML = '';
      }
      
      transcriptsDiv.appendChild(messageDiv);
      transcriptsDiv.scrollTop = transcriptsDiv.scrollHeight;
    }
  }

  new CustomVoiceWidget(CONFIG);
})();`;

  return new Response(jsContent, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/javascript',
    },
  });
});