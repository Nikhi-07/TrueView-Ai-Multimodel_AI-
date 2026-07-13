import { motion } from 'framer-motion';
import { cn } from '../../utils/helpers';

export default function ProgressBar({ label, value, max = 100, color = 'primary', className }) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  
  const colors = {
    primary: 'bg-primary-500 shadow-primary-500/50',
    success: 'bg-success-500 shadow-success-500/50',
    warning: 'bg-warning-500 shadow-warning-500/50',
    danger: 'bg-danger-500 shadow-danger-500/50',
  };

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-medium text-gray-400">{label}</span>
          <span className="text-xs font-bold text-gray-200">{percentage.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-1.5 w-full bg-surface-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={cn("h-full rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]", colors[color])}
        />
      </div>
    </div>
  );
}
