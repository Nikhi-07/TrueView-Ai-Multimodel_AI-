import { cn } from '../../utils/helpers';

/**
 * ChartPlaceholder – Placeholder chart container with shimmer.
 */
export default function ChartPlaceholder({ title, subtitle, height = 'h-64', className }) {
  return (
    <div className={cn('glass p-5', className)}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className={cn('relative rounded-xl overflow-hidden bg-surface-800/50', height)}>
        {/* Grid lines */}
        <div className="absolute inset-0 bg-grid opacity-30" />
        
        {/* Fake bar chart */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-around px-4 pb-4 gap-2">
          {[40, 65, 45, 80, 55, 70, 50, 85, 60, 75, 45, 90].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-md bg-gradient-to-t from-primary-500/30 to-primary-400/10 border border-primary-500/20 transition-all duration-500"
              style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>

        {/* Shimmer overlay */}
        <div className="absolute inset-0 shimmer opacity-20" />
        
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-gray-500 bg-surface-900/80 px-3 py-1.5 rounded-full border border-white/5">
            Chart data will render here
          </span>
        </div>
      </div>
    </div>
  );
}
