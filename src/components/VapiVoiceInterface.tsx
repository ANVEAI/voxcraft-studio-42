import React, { useEffect, useRef, useState } from 'react';
import Vapi from '@vapi-ai/web';

interface VapiVoiceInterfaceProps {
  assistantId: string;
  publicKey?: string;
  position?: 'left' | 'right';
  theme?: 'light' | 'dark';
  onSpeakingChange?: (speaking: boolean) => void;
  onTranscript?: (transcript: string) => void;
}

const VapiVoiceInterface: React.FC<VapiVoiceInterfaceProps> = ({
  assistantId,
  publicKey,
  position = 'right',
  theme = 'light',
  onSpeakingChange,
  onTranscript
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const vapiRef = useRef<Vapi | null>(null);
  const [conversationMemory, setConversationMemory] = useState<any[]>([]);
  const [currentPageElements, setCurrentPageElements] = useState<any[]>([]);
  const [lastProcessedTranscript, setLastProcessedTranscript] = useState('');

  useEffect(() => {
    // Initialize Vapi instance
    console.log('[VapiInterface] Initializing Vapi with assistant ID:', assistantId);
    console.log('[VapiInterface] Using public key:', publicKey ? `${publicKey.substring(0, 10)}...` : 'NO KEY PROVIDED');
    
    if (!publicKey) {
      console.error('[VapiInterface] No public key provided! Please get your VAPI public key from https://dashboard.vapi.ai and add it to your .env file as VITE_VAPI_PUBLIC_KEY');
      return;
    }
    
    try {
      // Initialize with just the public key - Vapi doesn't support config in constructor
      vapiRef.current = new Vapi(publicKey);
      console.log('[VapiInterface] Vapi instance created successfully');
      
      // Try to disable Krisp globally before any calls
      if (typeof window !== 'undefined') {
        // Set global flags to disable Krisp
        (window as any).KRISP_DISABLED = true;
        (window as any).DISABLE_KRISP = true;
        (window as any).VAPI_DISABLE_KRISP = true;
        
        // Mock KrispSDK if it exists
        if ((window as any).KrispSDK) {
          (window as any).KrispSDK = {
            createNoiseFilter: () => Promise.reject(new Error('Krisp disabled')),
            isSupported: () => false,
            init: () => Promise.reject(new Error('Krisp disabled'))
          };
        }
      }
      
      // Set up event listeners
      vapiRef.current.on('call-start', () => {
        console.log('[VapiInterface] ✅ Call started successfully');
        setIsConnected(true);
        setIsSpeaking(false);
        onSpeakingChange?.(false);
      });

      vapiRef.current.on('call-end', () => {
        console.log('[VapiInterface] ❌ Call ended');
        setIsConnected(false);
        setIsListening(false);
        setIsSpeaking(false);
        onSpeakingChange?.(false);
      });

      vapiRef.current.on('speech-start', () => {
        console.log('[VapiInterface] 🎤 User speech started');
        setIsListening(true);
      });

      vapiRef.current.on('speech-end', () => {
        console.log('[VapiInterface] 🎤 User speech ended');
        setIsListening(false);
      });

      vapiRef.current.on('message', (message: any) => {
        console.log('[VapiInterface] 📨 Received message:', message);
        
        if (message.type === 'conversation-update') {
          // Handle conversation updates
          const content = message.conversation || [];
          setConversationMemory(content);
        }
        
        if (message.type === 'transcript' && message.transcriptType === 'final') {
          console.log('[VapiInterface] 📝 Final transcript:', message.transcript);
          onTranscript?.(message.transcript);
          
          // Enhanced transcript processing with fuzzy matching
          handleEnhancedTranscript(message);
        }
        
        if (message.type === 'function-call') {
          console.log('[VapiInterface] 🔧 Function call received:', message.functionCall?.name, message.functionCall?.parameters);
          // Handle function calls for navigation
          handleNavigationCommand(message);
        }
        
        // Handle assistant speaking state
        if (message.type === 'speech-start' || message.type === 'speech-update') {
          if (message.role === 'assistant') {
            console.log('[VapiInterface] 🔊 Assistant started speaking');
            setIsSpeaking(true);
            onSpeakingChange?.(true);
          }
        }
        
        if (message.type === 'speech-end') {
          if (message.role === 'assistant') {
            console.log('[VapiInterface] 🔇 Assistant stopped speaking');
            setIsSpeaking(false);
            onSpeakingChange?.(false);
          }
        }
      });

      vapiRef.current.on('error', (error: any) => {
        console.error('[VapiInterface] Error:', error);
        setIsConnected(false);
        setIsListening(false);
        setIsSpeaking(false);
        onSpeakingChange?.(false);
      });

    } catch (error) {
      console.error('[VapiInterface] Failed to initialize Vapi:', error);
    }

    // Initialize page content analysis
    analyzePageContent();
    
    // Set up dynamic content monitoring
    const observer = new MutationObserver(() => {
      setTimeout(analyzePageContent, 1000);
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => {
      if (vapiRef.current) {
        vapiRef.current.stop();
      }
      observer.disconnect();
    };
  }, [assistantId, publicKey]);

  const sendFeedbackToBot = (message: string) => {
    if (vapiRef.current) {
      try {
        vapiRef.current.send({
          type: 'add-message',
          message: {
            role: 'system',
            content: message
          }
        });
      } catch (error) {
        console.log('[VapiInterface] Could not send feedback:', error);
      }
    }
  };

  const analyzePageContent = () => {
    console.log('[VapiInterface] 🔍 Analyzing page content...');
    
    const selectors = [
      'a[href]:not([href^="#"]):not([href^="javascript:"]):not([href^="mailto:"]):not([href^="tel:"])',
      'button:not([disabled])',
      '[role="button"]:not([disabled])',
      'input[type="submit"]:not([disabled])',
      'input[type="button"]:not([disabled])',
      '.btn:not([disabled])',
      '.button:not([disabled])'
    ];
    
    const elements: any[] = [];
    
    selectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (isElementVisible(el as HTMLElement)) {
            const text = getElementText(el as HTMLElement);
            if (text && text.length > 0) {
              elements.push({
                element: el,
                text: text,
                href: (el as HTMLAnchorElement).href || ''
              });
            }
          }
        });
      } catch (e) {
        console.warn('[VapiInterface] Selector error:', selector, e);
      }
    });
    
    setCurrentPageElements(elements);
    console.log(`[VapiInterface] 🔍 Found ${elements.length} interactive elements`);
  };

  const isElementVisible = (element: HTMLElement): boolean => {
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
  };

  const getElementText = (element: HTMLElement): string => {
    try {
      return element.getAttribute('aria-label') ||
             element.textContent?.trim() ||
             (element as HTMLInputElement).value ||
             element.getAttribute('alt') ||
             element.getAttribute('title') ||
             (element as HTMLInputElement).placeholder ||
             '';
    } catch (e) {
      return '';
    }
  };

  const handleEnhancedTranscript = (message: any) => {
    const transcript = message.transcript?.trim();
    if (!transcript || transcript.length < 3) {
      console.log('[VapiInterface] ⚠️ Empty or too short transcript, ignoring');
      return;
    }

    // Simple duplicate check
    if (transcript === lastProcessedTranscript) {
      console.log('[VapiInterface] ⚠️ Duplicate transcript, ignoring');
      return;
    }

    console.log('[VapiInterface] 📝 Processing enhanced transcript:', transcript);
    setLastProcessedTranscript(transcript);
    
    // Only process if call is active and assistant is not speaking
    if (!isConnected) {
      console.log('[VapiInterface] ⚠️ Call not active, ignoring transcript');
      return;
    }

    if (isSpeaking) {
      console.log('[VapiInterface] ⚠️ Assistant speaking, ignoring transcript');
      return;
    }

    // Simple bot speech pattern check
    const lowerTranscript = transcript.toLowerCase();
    const botIndicators = [
      'i can help', 'let me help', 'i\'ll navigate', 'i understand',
      'taking you to', 'going to', 'i found', 'here are the',
      'would you like', 'how can i assist', 'navigating to'
    ];

    if (botIndicators.some(indicator => lowerTranscript.includes(indicator))) {
      console.log('[VapiInterface] ⚠️ Detected bot speech pattern, ignoring:', transcript);
      return;
    }

    // Process with enhanced command matching
    setTimeout(() => {
      processEnhancedCommand(lowerTranscript, transcript);
    }, 500);
  };

  const processEnhancedCommand = (lowerTranscript: string, originalTranscript: string) => {
    console.log('[VapiInterface] ⚡ Processing enhanced command:', lowerTranscript);

    // Enhanced navigation commands with fuzzy matching
    const commands: { [key: string]: () => void } = {
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
      sendFeedbackToBot(`✅ Executed: ${originalTranscript}`);
      return;
    }

    // Check for partial matches
    for (const [command, action] of Object.entries(commands)) {
      if (lowerTranscript.includes(command)) {
        action();
        sendFeedbackToBot(`✅ Executed: ${originalTranscript}`);
        return;
      }
    }

    // Try fuzzy matching for page elements
    const element = findElementByVoice(lowerTranscript);
    if (element) {
      clickElementWithFeedback(element);
      const elementText = getElementText(element);
      sendFeedbackToBot(`✅ Clicked: ${elementText}`);
      return;
    }

    // Command not recognized
    sendFeedbackToBot(`❓ Not recognized: "${originalTranscript}"`);
    console.log('[VapiInterface] ❓ Command not recognized:', lowerTranscript);
  };

  const navigateToPage = (searchTerms: string[]) => {
    console.log('[VapiInterface] 🧭 Navigating to:', searchTerms);
    
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
      console.log('[VapiInterface] ❌ Navigation target not found:', searchTerms);
      sendFeedbackToBot(`❌ Could not find: ${searchTerms[0]}`);
      return false;
    }
  };

  const scrollPage = (direction: string) => {
    console.log('[VapiInterface] 📜 Scrolling:', direction);
    
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
    
    sendFeedbackToBot(`📜 Scrolled ${direction}`);
  };

  const findElementByVoice = (transcript: string): HTMLElement | null => {
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
  };

  const clickElementWithFeedback = (element: HTMLElement) => {
    try {
      console.log('[VapiInterface] 🖱️ Clicking element:', getElementText(element));
      
      // Scroll element into view first
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Wait a moment then click
      setTimeout(() => {
        element.focus();
        element.click();
        
        // Re-analyze page after click (for dynamic content)
        setTimeout(() => {
          analyzePageContent();
        }, 1000);
      }, 300);
      
    } catch (error) {
      console.error('[VapiInterface] ❌ Click failed:', error);
      sendFeedbackToBot('❌ Click failed');
    }
  };

  const refreshPage = () => {
    sendFeedbackToBot('🔄 Refreshing page...');
    window.location.reload();
  };

  const showHelp = () => {
    const commands = [
      'home, about, contact, services',
      'scroll up/down, go to top/bottom',
      'login, register, blog, products'
    ].join(' | ');
    
    sendFeedbackToBot(`ℹ️ Try: ${commands}`);
  };

  const analyzeCurrentPage = () => {
    analyzePageContent();
    const count = currentPageElements.length;
    const sample = currentPageElements
      .slice(0, 5)
      .map(item => item.text)
      .join(', ');
    
    sendFeedbackToBot(`📊 ${count} elements: ${sample}`);
  };

  const handleNavigationCommand = (message: any) => {
    const { functionCall } = message;
    if (!functionCall) return;

    const { name, parameters } = functionCall;
    
    switch (name) {
      case 'scroll_page':
        const direction = parameters?.direction || 'down';
        const amount = parseInt(parameters?.amount) || 500;
        const initialScrollY = window.pageYOffset;
        
        window.scrollBy({ 
          top: direction === 'down' ? amount : -amount, 
          behavior: 'smooth' 
        });
        
        // Send feedback after scrolling
        setTimeout(() => {
          const newScrollY = window.pageYOffset;
          const scrolled = Math.abs(newScrollY - initialScrollY);
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          const scrollPercent = Math.round((newScrollY / maxScroll) * 100);
          
          sendFeedbackToBot(`Successfully scrolled ${direction} by ${scrolled}px. Page is now ${scrollPercent}% scrolled from top. Current position: ${Math.round(newScrollY)}px of ${Math.round(maxScroll)}px total.`);
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
        const sectionName = parameters?.section?.toLowerCase();
        if (sectionName) {
          // Enhanced section finding
          let element = document.getElementById(sectionName.replace(/\s+/g, '-')) ||
                       document.getElementById(sectionName.replace(/\s+/g, '_')) ||
                       document.querySelector(`[data-section="${sectionName}"]`) ||
                       document.querySelector(`[id*="${sectionName.replace(/\s+/g, '')}"]`);
          
          // Search in headings
          if (!element) {
            const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
            element = Array.from(headings).find(el => 
              el.textContent && el.textContent.toLowerCase().includes(sectionName)
            ) as HTMLElement;
          }
          
          // Search in all text content
          if (!element) {
            const allElements = document.querySelectorAll('*');
            element = Array.from(allElements).find(el => 
              el.textContent && 
              el.textContent.toLowerCase().includes(sectionName) && 
              (el as HTMLElement).offsetHeight > 0
            ) as HTMLElement;
          }
          
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Visual feedback
            const originalBackground = (element as HTMLElement).style.backgroundColor;
            (element as HTMLElement).style.transition = 'background-color 0.5s ease';
            (element as HTMLElement).style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            
            setTimeout(() => {
              (element as HTMLElement).style.backgroundColor = originalBackground;
              sendFeedbackToBot(`Successfully navigated to section "${sectionName}". Found element: ${element.tagName.toLowerCase()} with text: "${element.textContent?.substring(0, 100)}..."`);
            }, 1000);
          } else {
            sendFeedbackToBot(`Could not find section "${sectionName}". Available sections might include headers or elements with specific IDs.`);
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
          .map(h => `${h.tagName}: ${h.textContent?.substring(0, 50)}...`)
          .join(', ');
        
        sendFeedbackToBot(`Page Info - Title: "${pageInfo.title}", URL: ${pageInfo.url}, Scroll: ${pageInfo.scrollPercent}% (${pageInfo.scrollPosition}px of ${pageInfo.pageHeight}px). Main headings: ${headings}`);
        break;
        
      case 'open_website':
      case 'navigate_to_url':
        const query = parameters?.query || parameters?.url;
        if (query) {
          let url = query;
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            // Check if it's a search query or direct URL
            if (url.includes(' ') || (!url.includes('.') && url.length > 0)) {
              // Treat as search query
              url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
            } else {
              // Treat as direct URL
              url = `https://${url}`;
            }
          }
          
          const newWindow = window.open(url, '_blank');
          if (newWindow) {
            sendFeedbackToBot(`Successfully opened new tab with URL: ${url}`);
          } else {
            sendFeedbackToBot(`Attempted to open ${url} but popup might be blocked. Please check browser settings.`);
          }
        }
        break;
        
      case 'click_element':
        const elementText = parameters?.text?.toLowerCase();
        if (elementText) {
          const selectors = [
            'button', 'a', '[role="button"]', '[data-action]', 
            'input[type="button"]', 'input[type="submit"]', '.btn', '[onclick]'
          ];
          
          let found = false;
          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              const text = element.textContent || element.getAttribute('aria-label') || element.getAttribute('title');
              if (text && text.toLowerCase().includes(elementText)) {
                // Visual feedback before clicking
                (element as HTMLElement).style.transition = 'transform 0.2s ease';
                (element as HTMLElement).style.transform = 'scale(0.95)';
                
                setTimeout(() => {
                  (element as HTMLElement).style.transform = 'scale(1)';
                  (element as HTMLElement).click();
                  sendFeedbackToBot(`Successfully clicked element: "${text.substring(0, 50)}..." (${element.tagName.toLowerCase()})`);
                }, 100);
                
                found = true;
                break;
              }
            }
            if (found) break;
          }
          
          if (!found) {
            sendFeedbackToBot(`Could not find clickable element containing "${elementText}". Available clickable elements: ${Array.from(document.querySelectorAll('button, a')).slice(0, 5).map(el => el.textContent?.substring(0, 30)).join(', ')}`);
          }
        }
        break;
        
      case 'read_page_content':
        const visibleText = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, div'))
          .filter(el => (el as HTMLElement).offsetHeight > 0)
          .map(el => el.textContent?.trim())
          .filter(text => text && text.length > 10)
          .slice(0, 20)
          .join(' ');
        
        sendFeedbackToBot(`Page content preview (first 500 chars): ${visibleText.substring(0, 500)}...`);
        break;
        
      default:
        sendFeedbackToBot(`Unknown navigation command: ${name}`);
    }
  };

  const startCall = async () => {
    if (!vapiRef.current) {
      console.error('[VapiInterface] Vapi instance not available');
      return;
    }

    try {
      console.log('[VapiInterface] 📞 Starting call with assistant:', assistantId);
      
      // Check microphone permission first
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('[VapiInterface] ✅ Microphone permission granted');
      } catch (micError) {
        console.error('[VapiInterface] ❌ Microphone permission denied:', micError);
        alert('Microphone access is required for voice calls. Please allow microphone access and try again.');
        return;
      }
      
      // Start call with assistant ID
      await vapiRef.current.start(assistantId);
      console.log('[VapiInterface] 🚀 Call start command sent');
      
    } catch (error) {
      console.error('[VapiInterface] ❌ Failed to start call:', error);
      alert('Failed to start voice call. Please check console for details.');
    }
  };

  const endCall = () => {
    if (vapiRef.current && isConnected) {
      console.log('[VapiInterface] Ending call');
      vapiRef.current.stop();
    }
  };

  const getButtonState = () => {
    if (isConnected && isSpeaking) return { icon: '🔊', color: '#f59e0b', text: 'Assistant Speaking' };
    if (isConnected && isListening) return { icon: '👂', color: '#10b981', text: 'Listening...' };
    if (isConnected) return { icon: '🔴', color: '#ef4444', text: 'End Call' };
    return { icon: '🎤', color: theme === 'dark' ? '#1f2937' : '#3b82f6', text: 'Start Voice Call' };
  };

  const buttonState = getButtonState();

  const getGradient = () => {
    if (isConnected && isSpeaking) return 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%)';
    if (isConnected && isListening) return 'linear-gradient(135deg, #10b981 0%, #14b8a6 50%, #06b6d4 100%)';
    if (isConnected) return 'linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)';
    return 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #a855f7 100%)';
  };

  return (
    <>
      <style>
        {`
          @keyframes vapi-multi-pulse {
            0% { 
              box-shadow: 
                0 8px 32px rgba(0, 0, 0, 0.25),
                0 0 0 0 rgba(59, 130, 246, 0.7),
                0 0 0 0 rgba(59, 130, 246, 0.4);
            }
            50% { 
              box-shadow: 
                0 12px 40px rgba(0, 0, 0, 0.3),
                0 0 0 12px rgba(59, 130, 246, 0.2),
                0 0 0 24px rgba(59, 130, 246, 0);
            }
            100% { 
              box-shadow: 
                0 8px 32px rgba(0, 0, 0, 0.25),
                0 0 0 0 rgba(59, 130, 246, 0),
                0 0 0 0 rgba(59, 130, 246, 0);
            }
          }
          
          @keyframes vapi-breathe {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.02); }
          }
          
          .vapi-voice-btn {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            border: 2px solid rgba(255, 255, 255, 0.2);
            background: ${getGradient()};
            backdrop-filter: blur(20px) saturate(180%);
            color: white;
            font-size: 28px;
            cursor: pointer;
            box-shadow: 
              0 8px 32px rgba(0, 0, 0, 0.25),
              0 0 0 0 rgba(59, 130, 246, 0.4),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: visible;
            outline: none;
          }
          
          .vapi-voice-btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
            transition: left 0.5s;
          }
          
          .vapi-voice-btn:hover::before {
            left: 100%;
          }
          
          .vapi-voice-btn:hover {
            transform: scale(1.08) rotate(2deg) !important;
            box-shadow: 
              0 12px 48px rgba(0, 0, 0, 0.3),
              0 0 0 6px rgba(59, 130, 246, 0.15),
              inset 0 1px 0 rgba(255, 255, 255, 0.3);
          }
          
          .vapi-voice-btn:active {
            transform: scale(0.95) !important;
          }
          
          .vapi-voice-btn.active {
            animation: vapi-multi-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          
          .vapi-voice-btn.idle {
            animation: vapi-breathe 3s ease-in-out infinite;
          }
          
          .vapi-voice-btn:focus-visible {
            outline: 3px solid rgba(59, 130, 246, 0.5);
            outline-offset: 4px;
          }
          
          @media (prefers-reduced-motion: reduce) {
            .vapi-voice-btn {
              animation: none !important;
              transition: none !important;
            }
          }
        `}
      </style>
      <div style={{ position: 'fixed', [position]: '24px', bottom: '24px', zIndex: 10000 }}>
        <button
          className={`vapi-voice-btn ${isConnected ? 'active' : 'idle'}`}
          onClick={isConnected ? endCall : startCall}
          title={buttonState.text}
          aria-label={buttonState.text}
          role="button"
        >
          {buttonState.icon}
        </button>
      </div>
    </>
  );
};

export default VapiVoiceInterface;