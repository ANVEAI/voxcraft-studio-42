import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SimpleVoiceInterfaceProps {
  assistantId: string;
  position?: 'left' | 'right';
  theme?: 'light' | 'dark';
  onSpeakingChange?: (speaking: boolean) => void;
  onTranscript?: (transcript: string) => void;
}

const SimpleVoiceInterface: React.FC<SimpleVoiceInterfaceProps> = ({
  assistantId,
  position = 'right',
  theme = 'light',
  onSpeakingChange,
  onTranscript
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    checkMicrophonePermission();
  }, []);

  const checkMicrophonePermission = async () => {
    try {
      // First try to get permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately
      setHasPermission(true);
    } catch (error) {
      console.error('Microphone permission denied:', error);
      setHasPermission(false);
    }
  };

  const startRecording = async () => {
    try {
      console.log('[SimpleVoice] Requesting microphone access...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;
      setHasPermission(true);
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('[SimpleVoice] Recording stopped, processing audio...');
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      onSpeakingChange?.(false);
      
      console.log('[SimpleVoice] Recording started');
    } catch (error) {
      console.error('[SimpleVoice] Error accessing microphone:', error);
      setHasPermission(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('[SimpleVoice] Stopping recording...');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    try {
      console.log('[SimpleVoice] Processing audio blob...');
      setIsSpeaking(true);
      onSpeakingChange?.(true);
      
      // Simulate processing for demo
      setTimeout(() => {
        setIsSpeaking(false);
        onSpeakingChange?.(false);
        
        // Mock transcript for demo
        const mockTranscript = "Hello, I heard your voice input!";
        onTranscript?.(mockTranscript);
        console.log('[SimpleVoice] Mock Transcript:', mockTranscript);
        
        // You can replace this with actual VAPI integration later
        console.log('[SimpleVoice] Audio processed successfully');
      }, 1000);
      
    } catch (error) {
      console.error('[SimpleVoice] Error processing audio:', error);
      setIsSpeaking(false);
      onSpeakingChange?.(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const getButtonState = () => {
    if (hasPermission === false) return { icon: '🚫', color: '#ef4444', text: 'No Mic Access' };
    if (isSpeaking) return { icon: '🔊', color: '#f59e0b', text: 'Speaking' };
    if (isRecording) return { icon: '🎙️', color: '#ef4444', text: 'Recording' };
    return { icon: '🎤', color: theme === 'dark' ? '#1f2937' : '#3b82f6', text: 'Start Voice' };
  };

  const buttonState = getButtonState();

  return (
    <button
      onClick={toggleRecording}
      disabled={hasPermission === false}
      style={{
        position: 'fixed',
        [position]: '20px',
        bottom: '20px',
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        border: 'none',
        background: buttonState.color,
        color: 'white',
        fontSize: '24px',
        cursor: hasPermission === false ? 'not-allowed' : 'pointer',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        zIndex: 10000,
        transition: 'all 0.3s ease',
        transform: 'scale(1)',
        opacity: hasPermission === false ? 0.5 : 1
      }}
      onMouseEnter={(e) => {
        if (hasPermission !== false) {
          e.currentTarget.style.transform = 'scale(1.1)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      title={buttonState.text}
    >
      {buttonState.icon}
    </button>
  );
};

export default SimpleVoiceInterface;