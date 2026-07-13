import { Search, Bell, Moon, Sun, ChevronDown, Menu, LogOut, User } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Navbar({ onMenuToggle }) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-white/[0.06] bg-surface-900/60 backdrop-blur-2xl">
      <div className="h-full px-6 flex items-center justify-between gap-4">
        {/* Left */}
        <div className="flex items-center gap-3 flex-1">
          <button onClick={onMenuToggle} className="lg:hidden p-2 rounded-xl hover:bg-white/[0.05] text-gray-400 transition-colors">
            <Menu size={20} />
          </button>
          {/* Search */}
          <div className="relative hidden sm:block max-w-md flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="text" placeholder="Search..." className="w-full pl-10 pr-4 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-primary-500/40 focus:bg-white/[0.05] transition-all duration-200" />
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="p-2.5 rounded-xl hover:bg-white/[0.05] text-gray-400 hover:text-gray-200 transition-colors">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          <button className="relative p-2.5 rounded-xl hover:bg-white/[0.05] text-gray-400 hover:text-gray-200 transition-colors">
            <Bell size={18} />
          </button>

          <div className="w-px h-8 bg-white/[0.06] mx-1" />

          {/* Profile Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-xl hover:bg-white/[0.05] transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center text-white text-xs font-bold">
                {user?.fullName?.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-sm font-medium text-gray-200 leading-tight">{user?.fullName?.split(' ')[0]}</div>
                <div className="text-[10px] text-gray-500">{user?.role}</div>
              </div>
              <ChevronDown size={14} className="text-gray-500 hidden md:block group-hover:text-gray-300 transition-colors" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 glass-strong rounded-xl overflow-hidden shadow-2xl py-1 animate-slide-up origin-top-right border-white/[0.08]">
                <div className="px-4 py-2 border-b border-white/[0.06] mb-1">
                  <p className="text-sm font-medium text-gray-200 truncate">{user?.fullName}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                <Link to="/profile" onClick={() => setDropdownOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-white/[0.04] hover:text-white transition-colors">
                  <User size={14} /> Profile
                </Link>
                <button onClick={() => { logout(); setDropdownOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-danger-400 hover:bg-white/[0.04] transition-colors text-left">
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
