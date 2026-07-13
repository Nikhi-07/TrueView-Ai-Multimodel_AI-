import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Timer } from 'lucide-react';
import { cn } from '../../utils/helpers';

/**
 * FocusTimer – Digital timer showing continuous focus duration.
 * 
 * Displays HH:MM:SS with a pulsing glow when actively focused.
 * The timer value is driven by the `seconds` prop from the parent.
 */
export default function FocusTimer({ seconds = 0, isFocused = false, className }) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const formatted = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div className={cn(
      'glass rounded-xl p-4 flex items-center gap-3 transition-all duration-300',
      isFocused ? 'border border-emerald-500/20' : 'border border-white/[0.06]',
      className
    )}>
      {/* Timer icon with pulse */}
      <div className="relative">
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
          isFocused
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-surface-800 text-gray-500'
        )}>
          <Timer size={20} />
        </div>
        {isFocused && (
          <motion.div
            className="absolute inset-0 rounded-lg border border-emerald-400/30"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>

      {/* Timer display */}
      <div className="flex-1">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-0.5">
          Focus Duration
        </div>
        <div className={cn(
          'text-xl font-bold font-mono tracking-wider transition-colors',
          isFocused ? 'text-emerald-400' : 'text-gray-400'
        )}>
          {formatted}
        </div>
      </div>

      {/* Status dot */}
      {isFocused && (
        <motion.div
          className="w-2.5 h-2.5 rounded-full bg-emerald-400"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          style={{ boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)' }}
        />
      )}
    </div>
  );
}
