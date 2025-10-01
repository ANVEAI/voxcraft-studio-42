import React from 'react';
import { Loader2, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VapiState } from './useCustomVapi';

interface StatusIndicatorProps {
  state: VapiState;
  error?: string | null;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  state,
  error,
  className,
}) => {
  const getStatusContent = () => {
    switch (state) {
      case 'idle':
        return {
          icon: <WifiOff className="w-4 h-4" />,
          text: 'Disconnected',
          color: 'text-muted-foreground',
        };
      case 'connecting':
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          text: 'Connecting...',
          color: 'text-primary',
        };
      case 'connected':
        return {
          icon: <Wifi className="w-4 h-4" />,
          text: 'Connected',
          color: 'text-primary',
        };
      case 'listening':
        return {
          icon: <Wifi className="w-4 h-4" />,
          text: 'Listening...',
          color: 'text-primary',
        };
      case 'speaking':
        return {
          icon: <Wifi className="w-4 h-4" />,
          text: 'Speaking...',
          color: 'text-primary',
        };
      case 'error':
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          text: error || 'Error occurred',
          color: 'text-destructive',
        };
      default:
        return {
          icon: <WifiOff className="w-4 h-4" />,
          text: 'Unknown',
          color: 'text-muted-foreground',
        };
    }
  };

  const { icon, text, color } = getStatusContent();

  return (
    <div className={cn('flex items-center gap-2', color, className)}>
      {icon}
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
};
