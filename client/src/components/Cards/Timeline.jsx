import { cn } from '../../utils/helpers';
import { Circle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';

export default function Timeline({ items = [], className }) {
  if (!items?.length) return <div className="text-sm font-semibold text-black p-4">No recent activity.</div>;

  const iconMap = {
    danger: <AlertCircle size={14} className="text-rose-700" />,
    warning: <AlertCircle size={14} className="text-amber-700" />,
    info: <Info size={14} className="text-black" />,
    success: <CheckCircle2 size={14} className="text-emerald-700" />,
  };

  const bgMap = {
    danger: 'bg-rose-50 border-rose-300',
    warning: 'bg-amber-50 border-amber-300',
    info: 'bg-gray-100 border-gray-300',
    success: 'bg-emerald-50 border-emerald-300',
  };

  return (
    <div className={cn("relative pl-4 space-y-6 before:absolute before:inset-y-2 before:left-[19px] before:w-px before:bg-gray-200", className)}>
      {items.map((item) => (
        <div key={item.id} className="relative flex gap-4">
          <div className={cn("absolute -left-4 w-7 h-7 rounded-full border flex items-center justify-center bg-white z-10", bgMap[item.severity] || bgMap.info)}>
             {iconMap[item.severity] || <Circle size={10} className="text-black" />}
          </div>
          <div className="flex-1 ml-6 pt-1">
            <p className="text-sm font-bold text-black leading-snug">{item.message}</p>
            <span className="text-[10px] text-black font-semibold font-mono tracking-wide mt-1 block">{item.time}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
