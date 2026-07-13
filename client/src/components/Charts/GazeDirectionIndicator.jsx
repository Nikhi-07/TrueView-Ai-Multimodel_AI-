import { motion } from 'framer-motion';
import { cn } from '../../utils/helpers';

/**
 * GazeDirectionIndicator – Compass-style SVG component showing gaze direction.
 * 
 * Renders a glowing directional indicator with an arrow pointing in the
 * current gaze direction (LEFT / RIGHT / UP / DOWN / CENTER).
 */

const DIRECTION_ANGLES = {
  center: null,
  up: -90,
  down: 90,
  left: 180,
  right: 0,
};

const DIRECTION_LABELS = {
  center: 'CENTER',
  up: 'UP',
  down: 'DOWN',
  left: 'LEFT',
  right: 'RIGHT',
};

export default function GazeDirectionIndicator({ direction = 'center', confidence = 0, className }) {
  const angle = DIRECTION_ANGLES[direction];
  const isCenter = direction === 'center';
  const label = DIRECTION_LABELS[direction] || 'N/A';

  // Color based on direction
  const dirColor = isCenter ? '#10b981' : '#f59e0b';
  const glowColor = isCenter ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)';

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <svg width="140" height="140" viewBox="0 0 140 140" className="drop-shadow-lg">
        {/* Outer glow ring */}
        <circle
          cx="70" cy="70" r="64"
          fill="none"
          stroke={glowColor}
          strokeWidth="2"
          opacity="0.5"
        />

        {/* Background circle */}
        <circle
          cx="70" cy="70" r="58"
          fill="rgba(15, 23, 42, 0.8)"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />

        {/* Compass markers */}
        {['U', 'R', 'D', 'L'].map((label, i) => {
          const a = (i * 90 - 90) * (Math.PI / 180);
          const x = 70 + 48 * Math.cos(a);
          const y = 70 + 48 * Math.sin(a);
          return (
            <text
              key={label}
              x={x}
              y={y + 4}
              textAnchor="middle"
              fill="rgba(148, 163, 184, 0.6)"
              fontSize="10"
              fontWeight="600"
              fontFamily="monospace"
            >
              {label}
            </text>
          );
        })}

        {/* Cross hair lines */}
        <line x1="70" y1="30" x2="70" y2="40" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
        <line x1="70" y1="100" x2="70" y2="110" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
        <line x1="30" y1="70" x2="40" y2="70" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
        <line x1="100" y1="70" x2="110" y2="70" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />

        {/* Inner circle */}
        <circle
          cx="70" cy="70" r="20"
          fill="none"
          stroke="rgba(148,163,184,0.1)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Center dot or directional arrow */}
        {isCenter ? (
          <>
            {/* Pulsing center dot */}
            <motion.circle
              cx="70" cy="70" r="8"
              fill={dirColor}
              initial={{ opacity: 0.6, r: 6 }}
              animate={{ opacity: [0.6, 1, 0.6], r: [6, 9, 6] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <circle cx="70" cy="70" r="4" fill="white" opacity="0.9" />
          </>
        ) : (
          <>
            {/* Directional arrow */}
            <motion.g
              initial={{ rotate: angle, opacity: 0 }}
              animate={{ rotate: angle, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              style={{ transformOrigin: '70px 70px' }}
            >
              {/* Arrow line */}
              <line
                x1="70" y1="70"
                x2="105" y2="70"
                stroke={dirColor}
                strokeWidth="3"
                strokeLinecap="round"
              />
              {/* Arrow head */}
              <polygon
                points="110,70 100,64 100,76"
                fill={dirColor}
              />
            </motion.g>

            {/* Center pivot */}
            <circle cx="70" cy="70" r="5" fill={dirColor} opacity="0.8" />
            <circle cx="70" cy="70" r="2" fill="white" />
          </>
        )}
      </svg>

      {/* Direction label */}
      <div className="mt-2 text-center">
        <div className="text-xs font-bold tracking-widest uppercase" style={{ color: dirColor }}>
          {label}
        </div>
        <div className="text-[10px] text-gray-500 font-mono mt-0.5">
          {(confidence * 100).toFixed(0)}% conf
        </div>
      </div>
    </div>
  );
}
