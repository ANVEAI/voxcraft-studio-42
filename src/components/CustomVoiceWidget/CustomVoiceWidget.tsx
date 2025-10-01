import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useCustomVapi } from './useCustomVapi';
import { AudioVisualizer } from './AudioVisualizer';
import { StatusIndicator } from './StatusIndicator';
import { VoiceControls } from './VoiceControls';

interface CustomVoiceWidgetProps {
  assistantId: string;
  publicKey: string;
  position?: 'left' | 'right' | 'center';
  theme?: 'light' | 'dark';
  className?: string;
}

interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export const CustomVoiceWidget: React.FC<CustomVoiceWidgetProps> = ({
  assistantId,
  publicKey,
  position = 'right',
  theme = 'light',
  className,
}) => {
  const { toast } = useToast();
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');

  const {
    state,
    isConnected,
    isSpeaking,
    isListening,
    volumeLevel,
    error,
    startCall,
    endCall,
    toggleMute,
    isMuted,
  } = useCustomVapi({
    assistantId,
    publicKey,
    onTranscript: (transcript, isFinal) => {
      if (isFinal && transcript) {
        setTranscripts(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'user',
            content: transcript,
            timestamp: new Date(),
          },
        ]);
        setCurrentTranscript('');
      } else {
        setCurrentTranscript(transcript);
      }
    },
    onFunctionCall: (functionCall) => {
      console.log('[CustomVoiceWidget] Function call:', functionCall);
      
      // Add assistant response to transcripts if available
      if (functionCall.result) {
        setTranscripts(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: functionCall.result,
            timestamp: new Date(),
          },
        ]);
      }
    },
    onError: (err) => {
      toast({
        title: 'Voice Assistant Error',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const handleStartCall = async () => {
    try {
      await startCall();
      toast({
        title: 'Call Started',
        description: 'Voice assistant is now active',
      });
    } catch (err) {
      // Error handling is done in the hook
    }
  };

  const handleEndCall = () => {
    endCall();
    setTranscripts([]);
    setCurrentTranscript('');
    toast({
      title: 'Call Ended',
      description: 'Voice assistant disconnected',
    });
  };

  const positionClasses = {
    left: 'left-4',
    right: 'right-4',
    center: 'left-1/2 -translate-x-1/2',
  };

  return (
    <div
      className={cn(
        'fixed bottom-4 z-50',
        positionClasses[position],
        className
      )}
    >
      <Card className={cn(
        'w-96 shadow-2xl border-2',
        theme === 'dark' && 'bg-card'
      )}>
        <CardContent className="p-6 space-y-4">
          {/* Header with status */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Voice Assistant</h3>
            <StatusIndicator state={state} error={error} />
          </div>

          {/* Audio visualizer */}
          <div className="bg-muted/30 rounded-lg p-4">
            <AudioVisualizer
              volumeLevel={volumeLevel}
              isActive={isSpeaking || isListening}
            />
          </div>

          {/* Transcripts */}
          {isConnected && (
            <ScrollArea className="h-48 rounded-lg border bg-background p-3">
              <div className="space-y-3">
                {transcripts.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'p-2 rounded-lg text-sm',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground ml-8'
                        : 'bg-muted mr-8'
                    )}
                  >
                    <div className="font-medium mb-1">
                      {msg.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    <div>{msg.content}</div>
                  </div>
                ))}
                
                {/* Current/partial transcript */}
                {currentTranscript && (
                  <div className="p-2 rounded-lg text-sm bg-muted/50 italic ml-8">
                    {currentTranscript}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {/* Controls */}
          <div className="flex justify-center">
            <VoiceControls
              state={state}
              isMuted={isMuted}
              onStartCall={handleStartCall}
              onEndCall={handleEndCall}
              onToggleMute={toggleMute}
            />
          </div>

          {/* Status messages */}
          {state === 'connecting' && (
            <p className="text-sm text-center text-muted-foreground">
              Initializing voice connection...
            </p>
          )}
          {state === 'listening' && (
            <p className="text-sm text-center text-primary font-medium">
              Listening... Speak now
            </p>
          )}
          {state === 'speaking' && (
            <p className="text-sm text-center text-primary font-medium">
              Assistant is speaking...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
