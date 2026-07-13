import { X } from 'lucide-react';
import { cn } from '../../utils/helpers';

const variants = {
  info: {
    bg: 'bg-primary-500/10 border-primary-500/20',
    text: 'text-primary-300',
    icon: 'text-primary-400',
  },
  success: {
    bg: 'bg-success-500/10 border-success-500/20',
    text: 'text-success-300',
    icon: 'text-success-400',
  },
  warning: {
    bg: 'bg-warning-500/10 border-warning-500/20',
    text: 'text-warning-300',
    icon: 'text-warning-400',
  },
  danger: {
    bg: 'bg-danger-500/10 border-danger-500/20',
    text: 'text-danger-300',
    icon: 'text-danger-400',
  },
};

/**
 * AlertBanner – Dismissible alert component.
 */
export default function AlertBanner({ variant = 'info', icon: Icon, title, message, onDismiss, className }) {
  const styles = variants[variant];

  return (
    <div className={cn('flex items-start gap-3 px-4 py-3 rounded-xl border', styles.bg, className)}>
      {Icon && (
        <div className={cn('mt-0.5', styles.icon)}>
          <Icon size={18} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {title && <p className={cn('text-sm font-semibold', styles.text)}>{title}</p>}
        {message && <p className={cn('text-sm mt-0.5', styles.text, 'opacity-80')}>{message}</p>}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={cn('p-1 rounded-lg hover:bg-white/[0.05] transition-colors', styles.icon)}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
