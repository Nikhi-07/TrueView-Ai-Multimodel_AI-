import { cn } from '../../utils/helpers';

const trendColors = {
  up: 'text-success-400',
  down: 'text-danger-400',
  neutral: 'text-gray-400',
};

/**
 * StatCard – Glassmorphic stat/metric card.
 */
export default function StatCard({ icon: Icon, label, value, trend, trendValue, trendDirection = 'neutral', className }) {
  return (
    <div className={cn('glass-hover p-5 group', className)}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-xl bg-primary-500/10 text-primary-400 group-hover:bg-primary-500/15 transition-colors">
          {Icon && <Icon size={20} />}
        </div>
        {trendValue && (
          <span className={cn('text-xs font-medium flex items-center gap-1', trendColors[trendDirection])}>
            {trendDirection === 'up' && '↑'}
            {trendDirection === 'down' && '↓'}
            {trendValue}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-100 mb-1">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
    </div>
  );
}
