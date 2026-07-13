import { Outlet } from 'react-router-dom';
import { Shield, Sparkles } from 'lucide-react';

/**
 * AuthLayout – Centered card layout for auth pages with animated gradient background.
 */
export default function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-surface-950">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary-500/10 rounded-full blur-[120px] animate-float" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-accent-500/10 rounded-full blur-[120px] animate-float" style={{ animationDelay: '3s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/[0.03] rounded-full blur-[100px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-glow-blue">
                <Shield size={28} className="text-white" />
              </div>
              <Sparkles size={14} className="absolute -top-1 -right-1 text-accent-400 animate-pulse" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-100">TrueView AI</h1>
          <p className="text-sm text-gray-500 mt-1">Smart Proctoring System</p>
        </div>

        {/* Card */}
        <div className="glass-strong p-8 animate-slide-up">
          <Outlet />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-600 mt-6">
          © 2026 TrueView AI. All rights reserved.
        </p>
      </div>
    </div>
  );
}
