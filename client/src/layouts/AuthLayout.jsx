import { Outlet } from 'react-router-dom';
import { Shield } from 'lucide-react';

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative bg-white text-black font-sans">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-3">
            <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center shadow-md">
              <Shield size={24} className="text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold text-black tracking-tight">TrueView AI</h1>
          <p className="text-xs font-semibold text-black mt-1">Smart Proctoring System</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-300 rounded-xl p-8 shadow-xl">
          <Outlet />
        </div>

        {/* Footer */}
        <p className="text-center text-xs font-bold text-black mt-6">
          © 2026 TrueView AI. All rights reserved.
        </p>
      </div>
    </div>
  );
}
