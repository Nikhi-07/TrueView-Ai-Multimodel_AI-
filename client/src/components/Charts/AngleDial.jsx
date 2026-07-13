import { motion } from 'framer-motion';
import { cn } from '../../utils/helpers';

/**
 * AngleDial – Immersive SVG gyro-like dial representing Pitch, Yaw, or Roll offsets.
 * Shows degrees from -90 to +90 with a rotating needle and glowing indicator.
 */
export default function AngleDial({ label, value = 0, min = -90, max = 90, className }) {
  // Normalize angle value to be inside bounds
  const clampedVal = Math.max(min, Math.min(max, value));
  
  // Calculate needle rotation (degrees)
  // Our dial is a 180-degree arch (from -90 to +90).
  // 0 degrees is facing straight up.
  const needleRotation = clampedVal;

  // Color coding based on displacement from 0
  const absVal = Math.abs(clampedVal);
  let color = 'text-primary-400';
  let glowColor = 'rgba(59, 130, 246, 0.4)';
  
  if (absVal > 15) {
    color = 'text-warning-400';
    glowColor = 'rgba(245, 158, 11, 0.4)';
  }
  if (absVal > 30) {
    color = 'text-danger-400';
    glowColor = 'rgba(239, 68, 68, 0.4)';
  }

  return (
    <div className={cn('flex flex-col items-center p-3 glass rounded-xl border border-white/[0.04] bg-surface-900/40', className)}>
      <div className="relative w-32 h-20 flex justify-center overflow-hidden">
        {/* Gauge Arch */}
        <svg width="120" height="120" viewBox="0 0 120 120" className="absolute top-0">
          {/* Background Arch Track */}
          <path
            d="M 20 70 A 40 40 0 0 1 100 70"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* Tick marks */}
          {[-90, -45, 0, 45, 90].map((tick) => {
            const angleRad = (tick - 90) * (Math.PI / 180);
            const x1 = 60 + 34 * Math.cos(angleRad);
            const y1 = 60 + 34 * Math.sin(angleRad);
            const x2 = 60 + 40 * Math.cos(angleRad);
            const y2 = 60 + 40 * Math.sin(angleRad);
            return (
              <line
                key={tick}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(148, 163, 184, 0.3)"
                strokeWidth="1.5"
              />
            );
          })}

          {/* Center Pivot */}
          <circle cx="60" cy="70" r="4" fill="rgba(255,255,255,0.2)" />
          
          {/* Gyro Needle */}
          <motion.g
            animate={{ rotate: needleRotation }}
            transition={{ type: 'spring', stiffness: 120, damping: 14 }}
            style={{ transformOrigin: '60px 70px' }}
          >
            {/* The needle pointer */}
            <line
              x1="60"
              y1="70"
              x2="60"
              y2="32"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className={cn(color)}
              style={{ filter: `drop-shadow(0 0 4px ${glowColor})` }}
            />
            {/* Pointer tip arrow */}
            <polygon
              points="60,26 57,32 63,32"
              fill="currentColor"
              className={cn(color)}
            />
          </motion.g>
        </svg>

        {/* Center Angle Reading */}
        <div className="absolute bottom-1 text-center">
          <span className={cn('text-lg font-bold font-mono tracking-tight', color)}>
            {clampedVal > 0 ? '+' : ''}
            {clampedVal.toFixed(0)}°
          </span>
        </div>
      </div>

      {/* Label */}
      <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1.5">
        {label}
      </span>
    </div>
  );
}
