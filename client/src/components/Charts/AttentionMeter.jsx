import { motion } from 'framer-motion';
import { cn } from '../../utils/helpers';

/**
 * AttentionMeter – Animated circular gauge showing attention percentage.
 * 
 * Color transitions: green (focused) → yellow (distracted) → red (looking away)
 * Features a glowing arc and animated score display.
 */
export default function AttentionMeter({ score = 0, status = 'focused', size = 140, className }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = Math.min(Math.max(score / 100, 0), 1);
  const strokeDashoffset = circumference - percentage * circumference;

  // Color based on attention status
  const colorMap = {
    focused: { stroke: '#10b981', glow: 'rgba(16, 185, 129, 0.4)', text: 'text-emerald-400' },
    distracted: { stroke: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)', text: 'text-amber-400' },
    looking_away: { stroke: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)', text: 'text-red-400' },
  };

  const colors = colorMap[status] || colorMap.focused;

  // Status label
  const statusLabels = {
    focused: 'FOCUSED',
    distracted: 'DISTRACTED',
    looking_away: 'AWAY',
  };

  return (
    <div className={cn('relative flex flex-col items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />

        {/* Glow layer */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={colors.glow}
          strokeWidth={strokeWidth + 6}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          strokeLinecap="round"
          style={{ filter: 'blur(4px)' }}
        />

        {/* Progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          strokeLinecap="round"
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={Math.round(score)}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cn('text-3xl font-bold tracking-tight', colors.text)}
        >
          {Math.round(score)}
        </motion.span>
        <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mt-0.5">
          {statusLabels[status] || 'N/A'}
        </span>
      </div>
    </div>
  );
}
