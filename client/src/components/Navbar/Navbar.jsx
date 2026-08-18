import { Search, Bell, ChevronDown, Menu, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Navbar({ onMenuToggle }) {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  const displayName = user?.fullName ? user.fullName.split(' ')[0] : 'Test';
  const displayRole = user?.role ? user.role.toUpperCase() : 'USER';
  const initial = (user?.fullName?.charAt(0) || 'T').toUpperCase();

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200/80 bg-white">
      <div className="h-full px-6 flex items-center justify-between gap-4">
        {/* Left Search Bar */}
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
          >
            <Menu size={18} />
          </button>
          
          <div className="relative w-full max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search sessions, reports, logs..."
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors">
            <Bell size={18} />
          </button>

          {/* User Profile Capsule */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {initial}
              </div>
              <div className="hidden sm:block text-left pr-1">
                <div className="text-[13px] font-bold text-slate-900 leading-tight">{displayName}</div>
                <div className="text-[9.5px] text-slate-400 uppercase font-semibold tracking-wider leading-tight">{displayRole}</div>
              </div>
              <ChevronDown size={14} className="text-slate-600" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 origin-top-right z-50">
                <div className="px-4 py-2 border-b border-slate-100 mb-1">
                  <p className="text-xs font-bold text-slate-900 truncate">{user?.fullName || 'Test User'}</p>
                  <p className="text-[11px] text-slate-500 truncate">{user?.email || 'test@trueview.ai'}</p>
                </div>
                <Link
                  to="/profile"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors font-medium"
                >
                  <UserIcon size={14} /> Profile
                </Link>
                <button
                  onClick={() => { logout(); setDropdownOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 transition-colors text-left font-semibold"
                >
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

