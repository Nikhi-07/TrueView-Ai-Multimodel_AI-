import { Mic } from 'lucide-react';
import { cn } from '../../utils/helpers';

/**
 * AudioVisualizer – Animated waveform placeholder.
 */
export default function AudioVisualizer({ isActive = false, label = 'Audio Monitor', className }) {
  const bars = 24;

  return (
    <div className={cn('glass p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mic size={14} className={isActive ? 'text-primary-400' : 'text-gray-600'} />
          <span className="text-xs font-medium text-gray-400">{label}</span>
        </div>
        <span className={cn(
          'text-[10px] font-medium px-2 py-0.5 rounded-full',
          isActive
            ? 'bg-success-400/15 text-success-400'
            : 'bg-surface-700 text-gray-500'
        )}>
          {isActive ? 'Listening' : 'Muted'}
        </span>
      </div>

      {/* Waveform bars */}
      <div className="flex items-center justify-center gap-[2px] h-16">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-1 rounded-full transition-all duration-300',
              isActive ? 'bg-gradient-to-t from-primary-500/60 to-accent-400/60' : 'bg-surface-700'
            )}
            style={{
              height: isActive ? `${Math.random() * 100}%` : '12%',
              minHeight: '4px',
              animationDelay: `${i * 0.05}s`,
              animation: isActive ? `waveform ${0.8 + Math.random() * 0.8}s ease-in-out infinite` : 'none',
            }}
          />
        ))}
      </div>

      {/* dB level */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-gray-600 font-mono">-60 dB</span>
        <div className="flex-1 mx-3 h-1 rounded-full bg-surface-800 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isActive ? 'bg-gradient-to-r from-success-400 via-warning-400 to-danger-400 w-1/3' : 'w-0'
            )}
          />
        </div>
        <span className="text-[10px] text-gray-600 font-mono">0 dB</span>
      </div>
    </div>
  );
}
