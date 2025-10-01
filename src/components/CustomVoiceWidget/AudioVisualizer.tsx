import React from 'react';
import { cn } from '@/lib/utils';

interface AudioVisualizerProps {
  volumeLevel: number;
  isActive: boolean;
  className?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  volumeLevel,
  isActive,
  className,
}) => {
  // Generate 5 bars with varying heights based on volume
  const bars = Array.from({ length: 5 }, (_, i) => {
    const baseHeight = 20;
    const maxHeight = 60;
    const heightMultiplier = isActive ? (volumeLevel / 100) : 0.1;
    const randomOffset = Math.sin((i + 1) * volumeLevel * 0.1) * 0.3;
    const height = baseHeight + (maxHeight - baseHeight) * heightMultiplier * (1 + randomOffset);
    
    return Math.max(baseHeight, Math.min(maxHeight, height));
  });

  return (
    <div className={cn('flex items-center justify-center gap-1 h-16', className)}>
      {bars.map((height, index) => (
        <div
          key={index}
          className={cn(
            'w-1 rounded-full transition-all duration-150',
            isActive ? 'bg-primary' : 'bg-muted-foreground/30'
          )}
          style={{
            height: `${height}%`,
            animationDelay: `${index * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
};
