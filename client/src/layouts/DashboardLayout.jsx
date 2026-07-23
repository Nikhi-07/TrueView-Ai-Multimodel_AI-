import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Navbar/Sidebar';
import Navbar from '../components/Navbar/Navbar';
import { cn } from '../utils/helpers';

export default function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main area */}
      <div
        className={cn(
          'transition-all duration-300 bg-white',
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-[260px]'
        )}
      >
        <Navbar onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
        
        {/* Page content */}
        <main className="p-6 min-h-[calc(100vh-4rem)] bg-white text-black">
          <div className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
