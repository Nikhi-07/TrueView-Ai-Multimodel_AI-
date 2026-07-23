import { Search, Bell, ChevronDown, Menu, LogOut, User } from 'lucide-react';
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

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-gray-200 bg-white">
      <div className="h-full px-6 flex items-center justify-between gap-4">
        {/* Left */}
        <div className="flex items-center gap-3 flex-1">
          <button onClick={onMenuToggle} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-black transition-colors">
            <Menu size={20} />
          </button>
          {/* Search */}
          <div className="relative hidden sm:block max-w-md flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="text" placeholder="Search sessions, reports, logs..." className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-black placeholder-gray-500 focus:outline-none focus:border-black transition-all duration-150" />
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <button className="relative p-2.5 rounded-lg hover:bg-gray-100 text-black transition-colors">
            <Bell size={18} />
          </button>

          <div className="w-px h-8 bg-gray-200 mx-1" />

          {/* Profile Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg hover:bg-gray-100 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center text-white text-xs font-bold">
                {user?.fullName?.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-sm font-bold text-black leading-tight">{user?.fullName?.split(' ')[0]}</div>
                <div className="text-[10px] text-gray-600 uppercase tracking-wider font-bold">{user?.role}</div>
              </div>
              <ChevronDown size={14} className="text-black hidden md:block group-hover:text-black transition-colors" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-300 rounded-lg overflow-hidden shadow-xl py-1 origin-top-right">
                <div className="px-4 py-2 border-b border-gray-200 mb-1">
                  <p className="text-sm font-bold text-black truncate">{user?.fullName}</p>
                  <p className="text-xs text-gray-600 truncate">{user?.email}</p>
                </div>
                <Link to="/profile" onClick={() => setDropdownOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-black hover:bg-gray-100 transition-colors font-medium">
                  <User size={14} /> Profile
                </Link>
                <button onClick={() => { logout(); setDropdownOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left font-bold">
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
