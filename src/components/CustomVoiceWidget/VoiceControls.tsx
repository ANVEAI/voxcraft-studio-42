import React from 'react';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VapiState } from './useCustomVapi';

interface VoiceControlsProps {
  state: VapiState;
  isMuted: boolean;
  onStartCall: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  className?: string;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  state,
  isMuted,
  onStartCall,
  onEndCall,
  onToggleMute,
  className,
}) => {
  const isConnected = state === 'connected' || state === 'listening' || state === 'speaking';
  const isConnecting = state === 'connecting';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Main call button */}
      {!isConnected ? (
        <Button
          onClick={onStartCall}
          disabled={isConnecting}
          size="lg"
          className={cn(
            'rounded-full w-16 h-16 shadow-lg transition-all',
            'bg-primary hover:bg-primary/90',
            isConnecting && 'animate-pulse'
          )}
        >
          <Phone className="w-6 h-6" />
        </Button>
      ) : (
        <>
          {/* Mute toggle */}
          <Button
            onClick={onToggleMute}
            variant="outline"
            size="lg"
            className={cn(
              'rounded-full w-14 h-14',
              isMuted && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            )}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </Button>

          {/* End call button */}
          <Button
            onClick={onEndCall}
            size="lg"
            className="rounded-full w-16 h-16 bg-destructive hover:bg-destructive/90 shadow-lg"
          >
            <PhoneOff className="w-6 h-6" />
          </Button>
        </>
      )}
    </div>
  );
};
