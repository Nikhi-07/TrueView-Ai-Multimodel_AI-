import { cn } from '../../utils/helpers';
import { Circle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';

export default function Timeline({ items = [], className }) {
  if (!items.length) return <div className="text-sm text-gray-500 p-4">No recent activity.</div>;

  const iconMap = {
    danger: <AlertCircle size={14} className="text-danger-400" />,
    warning: <AlertCircle size={14} className="text-warning-400" />,
    info: <Info size={14} className="text-primary-400" />,
    success: <CheckCircle2 size={14} className="text-success-400" />,
  };

  const bgMap = {
    danger: 'bg-danger-500/10 border-danger-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
    warning: 'bg-warning-500/10 border-warning-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]',
    info: 'bg-primary-500/10 border-primary-500/20 shadow-[0_0_10px_rgba(59,130,246,0.2)]',
    success: 'bg-success-500/10 border-success-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]',
  };

  return (
    <div className={cn("relative pl-4 space-y-6 before:absolute before:inset-y-2 before:left-[19px] before:w-px before:bg-gradient-to-b before:from-white/[0.08] before:to-transparent", className)}>
      {items.map((item, i) => (
        <div key={item.id} className="relative flex gap-4">
          <div className={cn("absolute -left-4 w-7 h-7 rounded-full border flex items-center justify-center bg-surface-900 z-10", bgMap[item.severity] || bgMap.info)}>
             {iconMap[item.severity] || <Circle size={10} className="text-gray-400" />}
          </div>
          <div className="flex-1 ml-6 pt-1">
            <p className="text-sm font-medium text-gray-200 leading-snug">{item.message}</p>
            <span className="text-[10px] text-gray-500 font-mono tracking-wide mt-1 block">{item.time}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
