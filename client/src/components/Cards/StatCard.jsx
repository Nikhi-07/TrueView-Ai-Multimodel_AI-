import { cn } from '../../utils/helpers';

export default function StatCard({ icon: Icon, label, value, trendValue, trendDirection = 'neutral', className }) {
  return (
    <div className={cn('bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all duration-200', className)}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700">
          {Icon && <Icon size={20} />}
        </div>
        {trendValue && (
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
            {trendValue}
          </span>
        )}
      </div>
      <div className="text-2xl font-extrabold text-slate-900 mb-1">{value}</div>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}
