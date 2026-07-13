import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Eye, Users, FileText, Bell, BarChart3,
  UserCog, Settings, ChevronLeft, ChevronRight, Shield, Sparkles,
  UserCheck, ScanFace, Scan, Focus
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';

const iconMap = { LayoutDashboard, Eye, Users, FileText, Bell, BarChart3, UserCog, Settings, UserCheck, ScanFace, Scan, Focus };

const baseNavItems = [
  { path: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { path: '/monitoring', label: 'Live Monitoring', icon: 'Eye' },
  { path: '/sessions', label: 'Sessions', icon: 'Users' },
  { path: '/reports', label: 'Reports', icon: 'FileText' },
  { path: '/alerts', label: 'Alerts', icon: 'Bell' },
  { path: '/analytics', label: 'Analytics', icon: 'BarChart3' },
  { path: '/face-registration', label: 'Face Enroll', icon: 'ScanFace' },
  { path: '/verify-identity', label: 'Verify Identity', icon: 'UserCheck' },
  { path: '/face-mesh', label: 'Face Mesh', icon: 'Scan' },
  { path: '/eye-gaze', label: 'Eye Gaze', icon: 'Focus' },
  { path: '/settings', label: 'Settings', icon: 'Settings' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user } = useAuth();
  
  // Conditionally add Users route for Admin
  const navItems = [...baseNavItems];
  if (user?.role === 'admin') {
    navItems.splice(6, 0, { path: '/users', label: 'Users', icon: 'UserCog' });
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen z-40 flex flex-col border-r border-white/[0.06]',
        'bg-surface-900/80 backdrop-blur-2xl transition-all duration-300',
        collapsed ? 'w-20' : 'w-[272px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/[0.06]">
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-glow-blue">
            <Shield size={18} className="text-white" />
          </div>
          <Sparkles size={10} className="absolute -top-0.5 -right-0.5 text-accent-400" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in">
            <div className="text-sm font-bold text-gray-100 leading-tight">TrueView AI</div>
            <div className="text-[10px] text-gray-500 font-medium tracking-wider uppercase">Smart Proctor</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = iconMap[item.icon];
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn('nav-item', isActive && 'active', collapsed && 'justify-center px-0')
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon size={19} className="flex-shrink-0" />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-white/[0.06]">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                     text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-all duration-200"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span className="text-xs font-medium">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
