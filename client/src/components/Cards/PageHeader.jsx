import { cn } from '../../utils/helpers';

export default function PageHeader({ title, subtitle, breadcrumb = [], actions, className }) {
  return (
    <div className={cn('mb-6', className)}>
      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <div className="flex items-center gap-1.5 mb-1.5">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-slate-400 text-xs">/</span>}
              <span className={cn(
                'text-xs font-medium',
                i === breadcrumb.length - 1 ? 'text-slate-800' : 'text-slate-400'
              )}>
                {item}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Title + Actions */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs font-medium text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
