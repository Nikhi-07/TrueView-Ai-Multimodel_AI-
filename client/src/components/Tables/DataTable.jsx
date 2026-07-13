import { cn } from '../../utils/helpers';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * DataTable – Styled table with sortable header placeholders and pagination.
 */
export default function DataTable({ columns = [], data = [], className }) {
  return (
    <div className={cn('glass overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-5 py-3.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-gray-500 text-sm">
                  No data available
                </td>
              </tr>
            ) : (
              data.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-white/[0.02] transition-colors">
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className="px-5 py-3.5 text-sm text-gray-300 whitespace-nowrap">
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
        <span className="text-xs text-gray-500">
          Showing {data.length > 0 ? 1 : 0}–{data.length} of {data.length} results
        </span>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-lg hover:bg-white/[0.05] text-gray-500 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button className="px-3 py-1 rounded-lg bg-primary-500/15 text-primary-400 text-xs font-medium">1</button>
          <button className="px-3 py-1 rounded-lg hover:bg-white/[0.05] text-gray-500 text-xs">2</button>
          <button className="px-3 py-1 rounded-lg hover:bg-white/[0.05] text-gray-500 text-xs">3</button>
          <button className="p-1.5 rounded-lg hover:bg-white/[0.05] text-gray-500 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
