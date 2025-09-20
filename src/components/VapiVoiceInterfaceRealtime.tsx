import React, { useEffect, useRef, useState } from 'react';
import Vapi from '@vapi-ai/web';
import { supabase } from '@/integrations/supabase/client';

interface VapiVoiceInterfaceProps {
  assistantId: string;
  publicKey?: string;
  position?: 'left' | 'right';
  theme?: 'light' | 'dark';
  onSpeakingChange?: (speaking: boolean) => void;
  onTranscript?: (transcript: string) => void;
  userId?: string; // For multi-tenant support
}

const VapiVoiceInterfaceRealtime: React.FC<VapiVoiceInterfaceProps> = ({
  assistantId,
  publicKey,
  position = 'right',
  theme = 'light',
  onSpeakingChange,
  onTranscript,
  userId = 'default'
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const vapiRef = useRef<Vapi | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // Initialize Vapi instance
    console.log('[VapiRealtime] Initializing with assistant:', assistantId);
    
    if (!publicKey) {
      console.error('[VapiRealtime] No public key provided!');
      return;
    }
    
    try {
      vapiRef.current = new Vapi(publicKey);
      
      // Set up VAPI event listeners
      vapiRef.current.on('call-start', () => {
        console.log('[VapiRealtime] ✅ Call started');
        setIsConnected(true);
        setIsSpeaking(false);
        onSpeakingChange?.(false);
      });

      vapiRef.current.on('call-end', () => {
        console.log('[VapiRealtime] ❌ Call ended');
        setIsConnected(false);
        setIsListening(false);
        setIsSpeaking(false);
        onSpeakingChange?.(false);
      });

      vapiRef.current.on('speech-start', () => {
        console.log('[VapiRealtime] 🎤 User speech started');
        setIsListening(true);
      });

      vapiRef.current.on('speech-end', () => {
        console.log('[VapiRealtime] 🎤 User speech ended');
        setIsListening(false);
      });

      vapiRef.current.on('message', (message: any) => {
        console.log('[VapiRealtime] 📨 VAPI message:', message);
        
        if (message.type === 'transcript' && message.transcriptType === 'final') {
          onTranscript?.(message.transcript);
        }
        
        if (message.type === 'function-call') {
          console.log('[VapiRealtime] 🔧 Function call:', message.functionCall);
          // Broadcast function call to realtime channel
          handleFunctionCall(message.functionCall);
        }
        
        // Handle assistant speaking state
        if (message.type === 'speech-start' && message.role === 'assistant') {
          setIsSpeaking(true);
          onSpeakingChange?.(true);
        }
        
        if (message.type === 'speech-end' && message.role === 'assistant') {
          setIsSpeaking(false);
          onSpeakingChange?.(false);
        }
      });

      vapiRef.current.on('error', (error: any) => {
        console.error('[VapiRealtime] Error:', error);
        setIsConnected(false);
        setIsListening(false);
        setIsSpeaking(false);
        onSpeakingChange?.(false);
      });

    } catch (error) {
      console.error('[VapiRealtime] Failed to initialize:', error);
    }

    // Set up Supabase realtime channel for receiving DOM commands
    setupRealtimeChannel();

    return () => {
      if (vapiRef.current) {
        vapiRef.current.stop();
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [assistantId, publicKey, userId]);

  const setupRealtimeChannel = () => {
    const channelName = `voice-commands-${userId}`;
    console.log('[VapiRealtime] Setting up realtime channel:', channelName);
    
    channelRef.current = supabase
      .channel(channelName)
      .on('broadcast', { event: 'voice_command' }, (payload: any) => {
        console.log('[VapiRealtime] 📡 Received voice command:', payload);
        executeCommand(payload.command);
      })
      .subscribe((status) => {
        console.log('[VapiRealtime] Channel status:', status);
      });
  };

  const handleFunctionCall = async (functionCall: any) => {
    const { name, parameters } = functionCall;
    console.log('[VapiRealtime] 🔧 Processing function call:', name, parameters);

    // Send command to DOM via realtime
    const command = {
      type: name,
      ...parameters,
      timestamp: Date.now()
    };

    try {
      await channelRef.current?.send({
        type: 'broadcast',
        event: 'voice_command',
        payload: { command }
      });
      console.log('[VapiRealtime] ✅ Command sent via realtime');
    } catch (error) {
      console.error('[VapiRealtime] ❌ Failed to send command:', error);
    }
  };

  const executeCommand = (command: any) => {
    console.log('[VapiRealtime] ⚡ Executing command:', command);
    
    switch (command.type) {
      case 'scroll_page':
        scrollPage(command.direction);
        break;
      case 'click_element':
        clickElement(command.text);
        break;
      case 'fill_field':
        fillField(command.value, command.field_hint);
        break;
      case 'toggle_element':
        toggleElement(command.target);
        break;
      default:
        console.log('[VapiRealtime] ❓ Unknown command type:', command.type);
    }
  };

  const scrollPage = (direction: string) => {
    console.log('[VapiRealtime] 📜 Scrolling:', direction);
    
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
    
    showStatus(`Scrolled ${direction}`);
  };

  const clickElement = (targetText: string) => {
    console.log('[VapiRealtime] 🖱️ Clicking element with text:', targetText);
    
    const selectors = [
      'button', 'a', '[role="button"]', 'input[type="button"]', 
      'input[type="submit"]', '.btn', '.button'
    ];
    
    let bestElement = null;
    let bestScore = 0;
    
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (isElementVisible(el as HTMLElement)) {
          const text = getElementText(el as HTMLElement);
          const similarity = calculateTextSimilarity(text.toLowerCase(), targetText.toLowerCase());
          
          if (similarity > bestScore && similarity > 0.3) {
            bestScore = similarity;
            bestElement = el as HTMLElement;
          }
        }
      });
    });
    
    if (bestElement) {
      highlightElement(bestElement);
      bestElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        bestElement.click();
        showStatus(`Clicked: ${getElementText(bestElement)}`);
      }, 300);
    } else {
      showStatus(`Element not found: ${targetText}`);
    }
  };

  const fillField = (value: string, fieldHint?: string) => {
    console.log('[VapiRealtime] ✏️ Filling field:', value, fieldHint);
    
    const inputs = Array.from(document.querySelectorAll('input, textarea')).filter(el => {
      const element = el as HTMLInputElement | HTMLTextAreaElement;
      return isElementVisible(element) && 
             !element.disabled && 
             !element.readOnly &&
             element.type !== 'hidden' &&
             element.type !== 'submit' &&
             element.type !== 'button';
    }) as (HTMLInputElement | HTMLTextAreaElement)[];
    
    let targetInput = null;
    
    if (fieldHint) {
      // Find field based on hint
      targetInput = inputs.find(input => {
        const text = `${input.placeholder} ${input.name} ${input.id} ${input.getAttribute('aria-label')}`.toLowerCase();
        return text.includes(fieldHint.toLowerCase());
      });
    }
    
    if (!targetInput && inputs.length > 0) {
      // Use first visible input
      targetInput = inputs[0];
    }
    
    if (targetInput) {
      highlightElement(targetInput);
      targetInput.focus();
      targetInput.value = value;
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      showStatus(`Filled field: ${value}`);
    } else {
      showStatus('No suitable input field found');
    }
  };

  const toggleElement = (target: string) => {
    console.log('[VapiRealtime] 🔄 Toggling element:', target);
    
    const selectors = [
      'input[type="checkbox"]', 'input[type="radio"]', 
      '[role="switch"]', '[role="checkbox"]',
      'details', '.toggle', '.switch'
    ];
    
    let bestElement = null;
    let bestScore = 0;
    
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (isElementVisible(el as HTMLElement)) {
          const text = getElementText(el as HTMLElement);
          const similarity = calculateTextSimilarity(text.toLowerCase(), target.toLowerCase());
          
          if (similarity > bestScore && similarity > 0.3) {
            bestScore = similarity;
            bestElement = el as HTMLElement;
          }
        }
      });
    });
    
    if (bestElement) {
      highlightElement(bestElement);
      bestElement.click();
      showStatus(`Toggled: ${getElementText(bestElement)}`);
    } else {
      showStatus(`Toggle element not found: ${target}`);
    }
  };

  // Utility functions
  const getElementText = (element: HTMLElement): string => {
    return element.getAttribute('aria-label') ||
           element.textContent?.trim() ||
           (element as HTMLInputElement).value ||
           element.getAttribute('alt') ||
           element.getAttribute('title') ||
           (element as HTMLInputElement).placeholder ||
           '';
  };

  const calculateTextSimilarity = (text1: string, text2: string): number => {
    const longer = text1.length > text2.length ? text1 : text2;
    const shorter = text1.length > text2.length ? text2 : text1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };

  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
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

  const highlightElement = (element: HTMLElement) => {
    const originalOutline = element.style.outline;
    element.style.outline = '3px solid #ff6b6b';
    setTimeout(() => {
      element.style.outline = originalOutline;
    }, 1000);
  };

  const showStatus = (message: string) => {
    console.log(`[VapiRealtime] 📢 ${message}`);
    
    // Create temporary status display
    const status = document.createElement('div');
    status.textContent = message;
    status.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      z-index: 10000;
      font-size: 14px;
    `;
    
    document.body.appendChild(status);
    setTimeout(() => {
      document.body.removeChild(status);
    }, 2000);
  };

  const startCall = async () => {
    if (vapiRef.current && !isConnected) {
      try {
        console.log('[VapiRealtime] 🚀 Starting call...');
        await vapiRef.current.start(assistantId);
      } catch (error) {
        console.error('[VapiRealtime] Failed to start call:', error);
      }
    }
  };

  const endCall = async () => {
    if (vapiRef.current && isConnected) {
      try {
        console.log('[VapiRealtime] 🛑 Ending call...');
        await vapiRef.current.stop();
      } catch (error) {
        console.error('[VapiRealtime] Failed to end call:', error);
      }
    }
  };

  const positionClass = position === 'left' ? 'left-8' : 'right-8';
  const buttonText = isConnected 
    ? (isSpeaking ? 'AI Speaking...' : (isListening ? 'Listening...' : 'End Call'))
    : 'Start Voice';

  return (
    <div className={`fixed bottom-8 ${positionClass} flex flex-col items-center gap-2 z-50`}>
      <button
        onClick={isConnected ? endCall : startCall}
        className={`
          px-6 py-3 rounded-full font-medium transition-all duration-200 shadow-lg
          ${isConnected 
            ? 'bg-red-500 hover:bg-red-600 text-white' 
            : 'bg-blue-500 hover:bg-blue-600 text-white'
          }
          ${isListening ? 'ring-4 ring-blue-300 animate-pulse' : ''}
          ${isSpeaking ? 'ring-4 ring-green-300 animate-pulse' : ''}
        `}
        disabled={false}
      >
        {buttonText}
      </button>
      
      {isConnected && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
          <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
        </div>
      )}
    </div>
  );
};

export default VapiVoiceInterfaceRealtime;