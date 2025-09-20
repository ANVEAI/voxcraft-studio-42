import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, ArrowRight, Upload, Check, Edit, Bot } from 'lucide-react'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'


interface AssistantData {
  // Step 1: Basic Configuration
  botName: string
  welcomeMessage: string
  systemPromptTemplate: string
  systemPrompt: string
  
  // Step 2: Voice and Appearance
  language: string
  voice: string
  position: 'left' | 'right'
  theme: 'light' | 'dark'
  
  // Step 3: Data Upload
  uploadedFiles: File[]
}

const CreateAssistant = () => {
  const { isSignedIn, isLoaded, getToken } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(1)
  const [assistantData, setAssistantData] = useState<AssistantData>({
    botName: '',
    welcomeMessage: '',
    systemPromptTemplate: '',
    systemPrompt: '',
    language: '',
    voice: '',
    position: 'right',
    theme: 'light',
    uploadedFiles: []
  })
  const [isCreating, setIsCreating] = useState(false)
  const [embedCode, setEmbedCode] = useState('')
  const [files, setFiles] = useState<File[]>([]) // Add this for file management

  const form = useForm()

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  const systemPromptTemplates = [
    { id: 'general', label: 'General Assistant', prompt: 'You are a helpful assistant that provides accurate and informative responses to user questions.' },
    { id: 'customer-service', label: 'Customer Service', prompt: 'You are a customer service representative. Be friendly, professional, and help resolve customer inquiries efficiently.' },
    { id: 'tutor', label: 'Educational Tutor', prompt: 'You are an educational tutor. Explain concepts clearly, provide examples, and encourage learning.' },
    { id: 'sales', label: 'Sales Assistant', prompt: 'You are a sales assistant. Help customers find products, explain features, and guide them through purchasing decisions.' },
    { id: 'support', label: 'Technical Support', prompt: 'You are a technical support specialist. Diagnose issues, provide step-by-step solutions, and ensure customer satisfaction.' }
  ]

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'hi', name: 'Hindi' },
    { code: 'zh', name: 'Chinese' }
  ]

  // VAPI Native Voice Options (Valid VAPI voice IDs only)
  const voices = [
    { id: 'vapi-elliot', name: 'Elliot - Professional Male', provider: 'vapi', voiceId: 'Elliot' },
    { id: 'vapi-kylie', name: 'Kylie - Clear Female', provider: 'vapi', voiceId: 'Kylie' },
    { id: 'vapi-rohan', name: 'Rohan - Confident Male', provider: 'vapi', voiceId: 'Rohan' },
    { id: 'vapi-lily', name: 'Lily - Warm Female', provider: 'vapi', voiceId: 'Lily' },
    { id: 'vapi-savannah', name: 'Savannah - Energetic Female', provider: 'vapi', voiceId: 'Savannah' },
    { id: 'vapi-hana', name: 'Hana - Gentle Female', provider: 'vapi', voiceId: 'Hana' },
    { id: 'vapi-neha', name: 'Neha - Friendly Female', provider: 'vapi', voiceId: 'Neha' },
    { id: 'vapi-cole', name: 'Cole - Deep Male', provider: 'vapi', voiceId: 'Cole' },
    { id: 'vapi-harry', name: 'Harry - Casual Male', provider: 'vapi', voiceId: 'Harry' },
    { id: 'vapi-paige', name: 'Paige - Professional Female', provider: 'vapi', voiceId: 'Paige' },
    { id: 'vapi-spencer', name: 'Spencer - Strong Male', provider: 'vapi', voiceId: 'Spencer' }
  ]

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleTemplateSelect = (template: any) => {
    setAssistantData({
      ...assistantData,
      systemPromptTemplate: template.label,
      systemPrompt: template.prompt
    })
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files) {
      const validFiles = Array.from(files).filter(file => 
        file.type === 'application/pdf' || 
        file.type === 'text/plain' || 
        file.type === 'text/csv'
      )
      setAssistantData({
        ...assistantData,
        uploadedFiles: [...assistantData.uploadedFiles, ...validFiles]
      })
    }
  }

  const removeFile = (index: number) => {
    const newFiles = assistantData.uploadedFiles.filter((_, i) => i !== index)
    setAssistantData({
      ...assistantData,
      uploadedFiles: newFiles
    })
  }

  const handleCreateBot = async () => {
    setIsCreating(true)
    try {
      // Validate required fields
      if (!assistantData.botName || !assistantData.welcomeMessage || !assistantData.systemPrompt || !assistantData.language || !assistantData.voice) {
        throw new Error('Please fill in all required fields')
      }

      // Get selected voice configuration
      const selectedVoiceConfig = voices.find(v => v.id === assistantData.voice);
      if (!selectedVoiceConfig) {
        throw new Error(`Invalid voice selection: ${assistantData.voice}`)
      }

      const selectedVoice = {
        voiceId: selectedVoiceConfig.voiceId,
        provider: selectedVoiceConfig.provider,
        name: selectedVoiceConfig.name
      };


      console.log('Creating VAPI assistant with data:', assistantData)

      // Convert files to base64 for edge function
      const convertedFiles = await Promise.all(
        assistantData.uploadedFiles.map(async (file) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                name: file.name,
                type: file.type,
                size: file.size,
                data: reader.result as string
              });
            };
            reader.readAsDataURL(file);
          });
        })
      );

      console.log('Creating VAPI assistant with files:', convertedFiles.length);

      // Use Supabase edge function to create assistant (secure approach)
      const { data: response, error } = await supabase.functions.invoke('create-vapi-assistant', {
        body: {
          assistantData,
          selectedVoice,
          files: convertedFiles
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to create assistant');
      }

      const vapiAssistant = response.assistant;

      // Step 5: Save assistant data to Supabase database
      console.log('Saving assistant to Supabase database...');
      try {
        // Get Clerk token for authentication
        const token = await getToken();
        if (!token) {
          throw new Error('No authentication token available');
        }

        // Use edge function to save assistant with proper authentication
        const { data: saveResponse, error: saveError } = await supabase.functions.invoke('save-assistant', {
          body: {
            user_id: user.id,
            vapi_assistant_id: vapiAssistant.id,
            name: assistantData.botName,
            welcome_message: assistantData.welcomeMessage,
            system_prompt: assistantData.systemPrompt,
            language: assistantData.language,
            voice_id: assistantData.voice,
            position: assistantData.position,
            theme: assistantData.theme,
            status: 'active'
          },
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (saveError) {
          console.error('Assistant save error:', saveError);
          throw new Error(saveError.message || 'Failed to save assistant');
        }

        console.log('Assistant saved to database:', saveResponse.assistant);
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
        // Don't throw - VAPI assistant creation was successful
      }

      const successMessage = assistantData.uploadedFiles.length > 0 
        ? `Assistant "${assistantData.botName}" created successfully with knowledge base! ID: ${vapiAssistant.id}. ${assistantData.uploadedFiles.length} files uploaded and connected.`
        : `Assistant "${assistantData.botName}" created successfully! ID: ${vapiAssistant.id}`;

      toast({
        title: "Success!",
        description: successMessage,
      })

      // Generate lightweight embed code using new system
      const embedCodeContent = `<script>
// Lightweight Voice Assistant Embed Script
// Add this script to any website to enable voice navigation
(function() {
  'use strict';
  
  // Configuration
  const config = {
    uuid: "${vapiAssistant.id}", // Assistant ID
    assistant: "${vapiAssistant.id}",
    language: "en",
    position: "${assistantData.position === 'left' ? 'bottom-left' : 'bottom-right'}",
    theme: "${assistantData.theme}",
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

  // Load main script from new external-chatbot-voice endpoint
  const script = document.createElement('script');
  script.src = 'https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/external-chatbot-voice?' + new URLSearchParams(config).toString();
  script.async = true;
  script.onload = function() {
    console.log('Voice navigation script loaded successfully');
  };
  script.onerror = function() {
    console.error('Failed to load voice navigation script');
  };
  document.head.appendChild(script);

})();
</script>`;

      setEmbedCode(embedCodeContent);

      toast({
        title: "Success!",
        description: successMessage,
      })

      // Don't navigate immediately, show the embed code first
      setCurrentStep(4)
      
    } catch (error) {
      console.error('Error creating assistant:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to create assistant. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const editStep = (step: number) => {
    setCurrentStep(step)
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <Label htmlFor="botName">Bot Name *</Label>
        <Input
          id="botName"
          value={assistantData.botName}
          onChange={(e) => setAssistantData({...assistantData, botName: e.target.value})}
          placeholder="e.g., Physics Tutor Bot"
          className="mt-1"
        />
      </div>
      
      <div>
        <Label htmlFor="welcomeMessage">Welcome Message *</Label>
        <Textarea
          id="welcomeMessage"
          value={assistantData.welcomeMessage}
          onChange={(e) => setAssistantData({...assistantData, welcomeMessage: e.target.value})}
          placeholder="Hi! I'm here to help. Ask me anything!"
          className="mt-1"
        />
      </div>
      
      <div>
        <Label>System Prompt Template</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {systemPromptTemplates.map((template) => (
            <Card 
              key={template.id} 
              className={`cursor-pointer transition-colors ${assistantData.systemPromptTemplate === template.label ? 'border-blue-500 bg-blue-50' : ''}`}
              onClick={() => handleTemplateSelect(template)}
            >
              <CardContent className="p-3">
                <p className="font-medium text-sm">{template.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      
      <div>
        <Label htmlFor="systemPrompt">System Prompt *</Label>
        <Textarea
          id="systemPrompt"
          value={assistantData.systemPrompt}
          onChange={(e) => setAssistantData({...assistantData, systemPrompt: e.target.value})}
          placeholder="Customize your assistant's behavior and instructions..."
          className="mt-1 min-h-[100px]"
        />
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label>Language *</Label>
          <Select value={assistantData.language} onValueChange={(value) => setAssistantData({...assistantData, language: value})}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {languages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label>Voice *</Label>
          <Select value={assistantData.voice} onValueChange={(value) => setAssistantData({...assistantData, voice: value})}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select voice" />
            </SelectTrigger>
            <SelectContent>
              {voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label>Position</Label>
          <Select value={assistantData.position} onValueChange={(value: 'left' | 'right') => setAssistantData({...assistantData, position: value})}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label>Theme</Label>
          <Select value={assistantData.theme} onValueChange={(value: 'light' | 'dark') => setAssistantData({...assistantData, theme: value})}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Upload Data Files</h3>
        <p className="mt-1 text-sm text-gray-500">
          Enhance your assistant's knowledge by uploading documents (Optional)
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Supported formats: PDF, TXT, CSV
        </p>
      </div>
      
      <div className="mt-6">
        <input
          type="file"
          multiple
          accept=".pdf,.txt,.csv"
          onChange={handleFileUpload}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload">
          <Button variant="outline" className="w-full cursor-pointer" asChild>
            <span>
              <Upload className="mr-2 h-4 w-4" />
              Choose Files
            </span>
          </Button>
        </label>
      </div>
      
      {assistantData.uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Uploaded Files:</h4>
          {assistantData.uploadedFiles.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span className="text-sm">{file.name}</span>
              <Button variant="ghost" size="sm" onClick={() => removeFile(index)}>
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-6">
      {embedCode ? (
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold">Assistant Created Successfully!</h3>
          <p className="text-gray-600">Your voice assistant is ready to deploy.</p>
          
          <div className="bg-gray-100 p-4 rounded-lg">
            <Label className="text-sm font-medium">Embed Code:</Label>
            <Textarea 
              value={embedCode} 
              readOnly 
              className="mt-2 font-mono text-xs"
              rows={6}
            />
            <Button 
              variant="outline" 
              className="mt-2 w-full"
              onClick={() => navigator.clipboard.writeText(embedCode)}
            >
              Copy Embed Code
            </Button>
          </div>
          
          <Button onClick={() => navigate('/dashboard')} className="w-full">
            Return to Dashboard
          </Button>
        </div>
      ) : (
        <div>
          <h3 className="text-lg font-semibold mb-4">Review & Deploy</h3>
          
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Basic Configuration</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => editStep(1)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><strong>Bot Name:</strong> {assistantData.botName || 'Not set'}</p>
                <p><strong>Welcome Message:</strong> {assistantData.welcomeMessage || 'Not set'}</p>
                <p><strong>Template:</strong> {assistantData.systemPromptTemplate || 'Not selected'}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Voice & Appearance</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => editStep(2)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><strong>Language:</strong> {languages.find(l => l.code === assistantData.language)?.name || 'Not selected'}</p>
                <p><strong>Voice:</strong> {voices.find(v => v.id === assistantData.voice)?.name || 'Not selected'}</p>
                <p><strong>Position:</strong> {assistantData.position}</p>
                <p><strong>Theme:</strong> {assistantData.theme}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Data Upload</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => editStep(3)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="text-sm">
                <p>{assistantData.uploadedFiles.length} file(s) uploaded</p>
              </CardContent>
            </Card>
          </div>
          
          <Button 
            onClick={handleCreateBot} 
            disabled={isCreating || !assistantData.botName || !assistantData.welcomeMessage || !assistantData.systemPrompt || !assistantData.language || !assistantData.voice}
            className="w-full mt-6"
          >
            {isCreating ? (
              <>
                <Bot className="mr-2 h-4 w-4 animate-spin" />
                Creating Assistant...
              </>
            ) : (
              <>
                <Bot className="mr-2 h-4 w-4" />
                Create Bot
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )

  const steps = [
    { number: 1, title: 'Basic Configuration', description: 'Set up your assistant\'s core settings' },
    { number: 2, title: 'Voice & Appearance', description: 'Customize how your assistant looks and sounds' },
    { number: 3, title: 'Data Upload', description: 'Upload documents to enhance knowledge (Optional)' },
    { number: 4, title: 'Review & Deploy', description: 'Review settings and create your assistant' }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mr-4">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-semibold text-gray-900">Create Voice Assistant</h1>
            </div>
            <div className="text-sm text-gray-600">
              Step {currentStep} of 4
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex justify-between">
            {steps.map((step) => (
              <div key={step.number} className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep >= step.number 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {currentStep > step.number ? <Check className="h-5 w-5" /> : step.number}
                </div>
                <div className="mt-2 text-center">
                  <p className="text-xs font-medium text-gray-900">{step.title}</p>
                  <p className="text-xs text-gray-500 hidden sm:block">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="p-6">
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
          </CardContent>
        </Card>

        {/* Navigation */}
        {currentStep < 4 && !embedCode && (
          <div className="flex justify-between mt-6">
            <Button 
              variant="outline" 
              onClick={handleBack} 
              disabled={currentStep === 1}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button 
              onClick={handleNext}
              disabled={
                (currentStep === 1 && (!assistantData.botName || !assistantData.welcomeMessage || !assistantData.systemPrompt)) ||
                (currentStep === 2 && (!assistantData.language || !assistantData.voice))
              }
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}

export default CreateAssistant