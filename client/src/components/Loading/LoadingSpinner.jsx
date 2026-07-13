import { cn } from '../../utils/helpers';

/**
 * LoadingSpinner – Branded loading animation.
 */
export default function LoadingSpinner({ size = 'md', className }) {
  const sizes = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className={cn('relative', sizes[size])}>
        <div className="absolute inset-0 rounded-full border-2 border-surface-700" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-400 animate-spin" />
        <div className="absolute inset-1 rounded-full border-2 border-transparent border-t-accent-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
      </div>
    </div>
  );
}
