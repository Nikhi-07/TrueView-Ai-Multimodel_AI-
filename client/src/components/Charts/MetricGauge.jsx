import { motion } from 'framer-motion';
import { cn } from '../../utils/helpers';

export default function MetricGauge({ value, max = 100, size = 120, strokeWidth = 8, label, className }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const safeValue = Number.isNaN(Number(value)) || value == null ? 0 : Number(value);
  const percentage = Math.min(Math.max(safeValue / max, 0), 1);
  const strokeDashoffset = circumference - percentage * circumference;

  let colorClass = 'text-emerald-600';
  if (percentage > 0.3) colorClass = 'text-amber-600';
  if (percentage > 0.7) colorClass = 'text-rose-600';

  return (
    <div className={cn("relative flex flex-col items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
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
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={colorClass}
          strokeLinecap="round"
        />
      </svg>
      
      {/* Center Value */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <motion.span 
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className={cn("text-2xl font-extrabold tracking-tight", colorClass)}
        >
          {safeValue}
        </motion.span>
        {label && <span className="text-[10px] text-black uppercase tracking-wider font-extrabold mt-0.5">{label}</span>}
      </div>
    </div>
  );
}
