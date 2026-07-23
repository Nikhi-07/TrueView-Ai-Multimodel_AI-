import { cn } from '../../utils/helpers';

const variants = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-800 border-rose-200',
  info: 'bg-slate-100 text-slate-800 border-slate-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
};

const dotColors = {
  success: 'bg-emerald-600',
  warning: 'bg-amber-600',
  danger: 'bg-rose-600',
  info: 'bg-slate-600',
  neutral: 'bg-slate-500',
};

export default function StatusBadge({ label, variant = 'neutral', dot = false, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-md border',
        variants[variant] || variants.neutral,
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant] || dotColors.neutral)} />}
      {label}
    </span>
  );
}
