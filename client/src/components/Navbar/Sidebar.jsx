import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Eye, Users, FileText, Bell,
  Settings, ChevronLeft, ChevronRight, Shield,
  Video, User, UserCog, Cpu, ChevronDown,
  Scan, Focus, Compass, Mic, Boxes, Activity, Brain
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';

const mainNavItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/monitoring', label: 'Live Monitoring', icon: Eye },
  { path: '/rooms', label: 'Join Session', icon: Video },
  { path: '/sessions', label: 'My Sessions', icon: Users },
  { path: '/reports', label: 'My Reports', icon: FileText },
  { path: '/alerts', label: 'My Alerts', icon: Bell },
  { path: '/profile', label: 'Profile', icon: User },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const aiModules = [
  { path: '/face-mesh', label: 'Face Mesh', icon: Scan },
  { path: '/eye-gaze', label: 'Eye Gaze', icon: Focus },
  { path: '/head-pose', label: 'Head Pose', icon: Compass },
  { path: '/voice-activity', label: 'Voice VAD', icon: Mic },
  { path: '/object-detection', label: 'Object Scan', icon: Boxes },
  { path: '/behaviour-analysis', label: 'Behaviour Control', icon: Activity },
  { path: '/decision-engine', label: 'Decision Engine', icon: Brain },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user } = useAuth();
  const location = useLocation();
  const isAiModuleActive = aiModules.some((m) => location.pathname === m.path);
  const [aiDropdownOpen, setAiDropdownOpen] = useState(isAiModuleActive);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen z-40 flex flex-col border-r border-slate-200/80',
        'bg-white transition-all duration-200 select-none',
        collapsed ? 'w-20' : 'w-[230px]'
      )}
    >
      {/* Logo Header */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-100 bg-white">
        <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center flex-shrink-0 shadow-sm">
          <Shield size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-[13px] font-extrabold text-slate-900 tracking-tight leading-tight">
              TRUEVIEW AI
            </div>
            <div className="text-[9px] text-slate-500 font-semibold tracking-wider uppercase leading-none mt-0.5">
              PROCTORING SYSTEM
            </div>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto bg-white">
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-slate-600 font-medium text-sm transition-colors duration-150',
                  'hover:text-slate-900 hover:bg-slate-100/80',
                  isActive && 'text-slate-900 font-bold bg-slate-100/90',
                  collapsed && 'justify-center px-0'
                )
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="flex-shrink-0 text-slate-800" />
              {!collapsed && (
                <span className="text-[13.5px] font-medium text-slate-800 tracking-tight">
                  {item.label}
                </span>
              )}
            </NavLink>
          );
        })}

        {/* AI Perception Modules Collapsible Section */}
        <div className="pt-2">
          <button
            onClick={() => setAiDropdownOpen(!aiDropdownOpen)}
            className={cn(
              'w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-slate-600 font-medium text-sm transition-colors duration-150',
              'hover:text-slate-900 hover:bg-slate-100/80',
              isAiModuleActive && 'text-slate-900 font-bold bg-slate-100/90',
              collapsed && 'justify-center px-0'
            )}
            title={collapsed ? 'AI Perception Modules' : undefined}
          >
            <div className="flex items-center gap-3.5">
              <Cpu size={18} className="flex-shrink-0 text-slate-800" />
              {!collapsed && (
                <span className="text-[13.5px] font-medium text-slate-800 tracking-tight">
                  AI Perception
                </span>
              )}
            </div>
            {!collapsed && (
              <ChevronDown
                size={14}
                className={cn(
                  'text-slate-500 transition-transform duration-200',
                  aiDropdownOpen && 'rotate-180'
                )}
              />
            )}
          </button>

          {/* Collapsible Sub-Items */}
          {aiDropdownOpen && !collapsed && (
            <div className="mt-1 ml-4 pl-2.5 border-l-2 border-slate-200 space-y-0.5 bg-white">
              {aiModules.map((item) => {
                const SubIcon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-colors',
                        isActive && 'bg-slate-100 text-slate-900 font-bold'
                      )
                    }
                  >
                    <SubIcon size={14} className="flex-shrink-0 text-slate-700" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          )}
        </div>

        {/* Admin Management (if admin) */}
        {user?.role === 'admin' && (
          <div className="pt-2 mt-2 border-t border-slate-100">
            <NavLink
              to="/users"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-slate-600 font-medium text-sm transition-colors duration-150',
                  'hover:text-slate-900 hover:bg-slate-100/80',
                  isActive && 'text-slate-900 font-bold bg-slate-100/90',
                  collapsed && 'justify-center px-0'
                )
              }
              title={collapsed ? 'User Management' : undefined}
            >
              <UserCog size={18} className="flex-shrink-0 text-slate-800" />
              {!collapsed && (
                <span className="text-[13.5px] font-medium text-slate-800 tracking-tight">
                  User Management
                </span>
              )}
            </NavLink>
          </div>
        )}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-3 border-t border-slate-100 bg-white">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-start px-3 py-2 rounded-lg
                     text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors duration-150 text-xs font-semibold gap-2"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          {!collapsed && <span className="text-[12px] font-semibold text-slate-700 tracking-tight">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}


