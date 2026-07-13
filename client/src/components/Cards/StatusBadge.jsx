import { cn } from '../../utils/helpers';

const variants = {
  success: 'bg-success-400/15 text-success-400 border-success-400/20',
  warning: 'bg-warning-400/15 text-warning-400 border-warning-400/20',
  danger: 'bg-danger-400/15 text-danger-400 border-danger-400/20',
  info: 'bg-primary-400/15 text-primary-400 border-primary-400/20',
  neutral: 'bg-surface-700/50 text-gray-300 border-surface-600',
};

const dotColors = {
  success: 'bg-success-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]',
  warning: 'bg-warning-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]',
  danger: 'bg-danger-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]',
  info: 'bg-primary-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]',
  neutral: 'bg-gray-400',
};

/**
 * StatusBadge – Colored status pill with optional animated dot.
 */
export default function StatusBadge({ label, variant = 'neutral', dot = false, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border',
        variants[variant],
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])} />}
      {label}
    </span>
  );
}
