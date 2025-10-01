import { useState, useEffect, useCallback, useRef } from 'react';
import Vapi from '@vapi-ai/web';

export type VapiState = 'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'error';

export interface UseCustomVapiProps {
  assistantId: string;
  publicKey: string;
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onFunctionCall?: (functionCall: any) => void;
  onError?: (error: Error) => void;
}

export interface UseCustomVapiReturn {
  state: VapiState;
  isConnected: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  volumeLevel: number;
  error: string | null;
  startCall: () => Promise<void>;
  endCall: () => void;
  sendMessage: (message: string) => void;
  toggleMute: () => void;
  isMuted: boolean;
}

export const useCustomVapi = ({
  assistantId,
  publicKey,
  onTranscript,
  onFunctionCall,
  onError,
}: UseCustomVapiProps): UseCustomVapiReturn => {
  const [state, setState] = useState<VapiState>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  
  const vapiRef = useRef<Vapi | null>(null);
  const volumeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Vapi instance
  useEffect(() => {
    if (!publicKey) return;
    
    vapiRef.current = new Vapi(publicKey);
    
    return () => {
      if (vapiRef.current) {
        vapiRef.current.stop();
      }
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
      }
    };
  }, [publicKey]);

  // Set up Vapi event listeners
  useEffect(() => {
    const vapi = vapiRef.current;
    if (!vapi) return;

    // Call started
    vapi.on('call-start', () => {
      console.log('[CustomVapi] Call started');
      setState('connected');
      setError(null);
      
      // Start volume monitoring
      volumeIntervalRef.current = setInterval(() => {
        const level = Math.random() * 100; // Replace with actual volume detection
        setVolumeLevel(level);
      }, 100);
    });

    // Call ended
    vapi.on('call-end', () => {
      console.log('[CustomVapi] Call ended');
      setState('idle');
      setIsSpeaking(false);
      setIsListening(false);
      setVolumeLevel(0);
      
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
    });

    // Speech events
    vapi.on('speech-start', () => {
      console.log('[CustomVapi] Bot started speaking');
      setIsSpeaking(true);
      setState('speaking');
    });

    vapi.on('speech-end', () => {
      console.log('[CustomVapi] Bot stopped speaking');
      setIsSpeaking(false);
      setState('listening');
    });

    // Message events
    vapi.on('message', (message: any) => {
      console.log('[CustomVapi] Message received:', message);
      
      if (message.type === 'transcript' && onTranscript) {
        onTranscript(
          message.transcript || message.transcriptPartial || '',
          message.transcript !== undefined
        );
      }
      
      if (message.type === 'function-call' && onFunctionCall) {
        onFunctionCall(message);
      }

      // Update listening state based on message
      if (message.role === 'user') {
        setIsListening(true);
        if (!isSpeaking) setState('listening');
      }
    });

    // Error handling
    vapi.on('error', (err: any) => {
      console.error('[CustomVapi] Error:', err);
      const errorMessage = err?.message || 'An error occurred';
      setError(errorMessage);
      setState('error');
      if (onError) {
        onError(new Error(errorMessage));
      }
    });

    // Cleanup
    return () => {
      vapi.removeAllListeners();
    };
  }, [onTranscript, onFunctionCall, onError, isSpeaking]);

  const startCall = useCallback(async () => {
    const vapi = vapiRef.current;
    if (!vapi || !assistantId) {
      const err = new Error('Vapi not initialized or missing assistant ID');
      setError(err.message);
      if (onError) onError(err);
      return;
    }

    try {
      setState('connecting');
      setError(null);

      // Check microphone permissions
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());

      // Start the call
      await vapi.start(assistantId);
      
    } catch (err: any) {
      console.error('[CustomVapi] Failed to start call:', err);
      const errorMessage = err?.message || 'Failed to start call';
      setError(errorMessage);
      setState('error');
      if (onError) onError(err);
    }
  }, [assistantId, onError]);

  const endCall = useCallback(() => {
    const vapi = vapiRef.current;
    if (!vapi) return;

    try {
      vapi.stop();
      setState('idle');
      setIsSpeaking(false);
      setIsListening(false);
      setVolumeLevel(0);
      setError(null);
    } catch (err: any) {
      console.error('[CustomVapi] Failed to end call:', err);
      if (onError) onError(err);
    }
  }, [onError]);

  const sendMessage = useCallback((message: string) => {
    const vapi = vapiRef.current;
    if (!vapi || state !== 'connected' && state !== 'listening' && state !== 'speaking') {
      console.warn('[CustomVapi] Cannot send message - not connected');
      return;
    }

    try {
      vapi.send({
        type: 'add-message',
        message: {
          role: 'user',
          content: message,
        },
      });
    } catch (err: any) {
      console.error('[CustomVapi] Failed to send message:', err);
      if (onError) onError(err);
    }
  }, [state, onError]);

  const toggleMute = useCallback(() => {
    const vapi = vapiRef.current;
    if (!vapi) return;

    try {
      vapi.setMuted(!isMuted);
      setIsMuted(!isMuted);
    } catch (err: any) {
      console.error('[CustomVapi] Failed to toggle mute:', err);
    }
  }, [isMuted]);

  return {
    state,
    isConnected: state === 'connected' || state === 'listening' || state === 'speaking',
    isSpeaking,
    isListening,
    volumeLevel,
    error,
    startCall,
    endCall,
    sendMessage,
    toggleMute,
    isMuted,
  };
};
