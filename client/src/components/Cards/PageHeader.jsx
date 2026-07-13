import { cn } from '../../utils/helpers';

/**
 * PageHeader – Reusable page title with breadcrumb and action buttons.
 */
export default function PageHeader({ title, subtitle, breadcrumb = [], actions, className }) {
  return (
    <div className={cn('mb-6', className)}>
      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-gray-600 text-xs">/</span>}
              <span className={cn(
                'text-xs',
                i === breadcrumb.length - 1 ? 'text-gray-300' : 'text-gray-500'
              )}>
                {item}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Title + Actions Row */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{title}</h1>
          {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
