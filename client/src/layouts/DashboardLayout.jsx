import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Navbar/Sidebar';
import Navbar from '../components/Navbar/Navbar';
import { cn } from '../utils/helpers';

export default function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main area */}
      <div
        className={cn(
          'transition-all duration-200 min-h-screen flex flex-col',
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-[230px]'
        )}
      >
        <Navbar onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
        
        {/* Page content */}
        <main className="p-6 md:p-8 flex-1 bg-[#f8fafc]">
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

