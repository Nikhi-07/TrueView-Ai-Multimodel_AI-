import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Eye, Users, FileText, Bell, BarChart3,
  UserCog, Settings, ChevronLeft, ChevronRight, Shield, ChevronDown,
  UserCheck, ScanFace, Scan, Focus, Compass, Mic, Boxes, Activity, Brain, Video, Cpu
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';

const mainNavItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/rooms', label: 'Virtual Rooms', icon: Video },
  { path: '/monitoring', label: 'Live Monitoring', icon: Eye },
  { path: '/sessions', label: 'Sessions', icon: Users },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/alerts', label: 'Alerts', icon: Bell },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
];

const aiModules = [
  { path: '/face-registration', label: 'Face Enroll', icon: ScanFace },
  { path: '/verify-identity', label: 'Verify Identity', icon: UserCheck },
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

  const isAiModuleActive = aiModules.some(m => location.pathname === m.path);
  const [aiDropdownOpen, setAiDropdownOpen] = useState(isAiModuleActive);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen z-40 flex flex-col border-r border-gray-200',
        'bg-white transition-all duration-200 shadow-sm',
        collapsed ? 'w-20' : 'w-[260px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-gray-200 bg-white">
        <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
          <Shield size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div>
            <div className="text-sm font-extrabold text-black tracking-tight">TRUEVIEW AI</div>
            <div className="text-[10px] text-gray-600 font-bold tracking-wider uppercase">Proctoring System</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto bg-white">
        {/* Main Navigation Items */}
        {mainNavItems.map((item) => {
          const Icon = item.icon;
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
              <Icon size={18} className="flex-shrink-0 text-black" />
              {!collapsed && <span className="text-sm font-semibold text-black">{item.label}</span>}
            </NavLink>
          );
        })}

        {/* AI Perception Modules Dropdown */}
        <div className="pt-2">
          <button
            onClick={() => setAiDropdownOpen(!aiDropdownOpen)}
            className={cn(
              'w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-black font-semibold hover:bg-gray-100 transition-all duration-150',
              isAiModuleActive && 'bg-gray-200 font-bold border-l-4 border-black rounded-r-lg rounded-l-none',
              collapsed && 'justify-center px-0'
            )}
            title={collapsed ? 'AI Perception Modules' : undefined}
          >
            <div className="flex items-center gap-3">
              <Cpu size={18} className="flex-shrink-0 text-black" />
              {!collapsed && <span className="text-sm font-semibold text-black">AI Perception Modules</span>}
            </div>
            {!collapsed && (
              <ChevronDown
                size={14}
                className={cn('text-black transition-transform duration-200', aiDropdownOpen && 'rotate-180')}
              />
            )}
          </button>

          {/* Sub-items */}
          {aiDropdownOpen && !collapsed && (
            <div className="mt-1 ml-4 pl-3 border-l-2 border-gray-300 space-y-1 bg-white">
              {aiModules.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-semibold text-black hover:bg-gray-100 transition-all',
                        isActive && 'bg-gray-200 text-black font-bold'
                      )
                    }
                  >
                    <Icon size={14} className="flex-shrink-0 text-black" />
                    <span className="text-black">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          )}
        </div>

        {/* Admin & Settings */}
        <div className="pt-2 border-t border-gray-200 mt-2 space-y-1">
          {user?.role === 'admin' && (
            <NavLink
              to="/users"
              className={({ isActive }) =>
                cn('nav-item', isActive && 'active', collapsed && 'justify-center px-0')
              }
              title={collapsed ? 'Users' : undefined}
            >
              <UserCog size={18} className="flex-shrink-0 text-black" />
              {!collapsed && <span className="text-sm font-semibold text-black">Users Management</span>}
            </NavLink>
          )}

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn('nav-item', isActive && 'active', collapsed && 'justify-center px-0')
            }
            title={collapsed ? 'Settings' : undefined}
          >
            <Settings size={18} className="flex-shrink-0 text-black" />
            {!collapsed && <span className="text-sm font-semibold text-black">Settings</span>}
          </NavLink>
        </div>
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-gray-200 bg-white">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg
                     text-black hover:bg-gray-100 transition-all duration-150 font-bold"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span className="text-xs font-bold text-black">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
