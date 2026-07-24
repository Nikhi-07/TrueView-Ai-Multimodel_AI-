import { motion } from 'framer-motion';
import { cn } from '../../utils/helpers';

export default function MetricGauge({ value, max = 100, size = 120, strokeWidth = 8, label, className }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const safeValue = Number.isNaN(Number(value)) || value == null ? 0 : Number(value);
  const percentage = Math.min(Math.max(safeValue / max, 0), 1);
  const strokeDashoffset = circumference - percentage * circumference;

  let colorClass = 'text-success-400';
  if (percentage > 0.3) colorClass = 'text-warning-400';
  if (percentage > 0.7) colorClass = 'text-danger-400';

  return (
    <div className={cn("relative flex flex-col items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-surface-800"
        />
        {/* Progress Circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className={cn("drop-shadow-glow", colorClass)}
          strokeLinecap="round"
        />
      </svg>
      
      {/* Center Value */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span 
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className={cn("text-2xl font-bold tracking-tighter", colorClass)}
        >
          {safeValue}
        </motion.span>
        {label && <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mt-0.5">{label}</span>}
      </div>
    </div>
  );
}
