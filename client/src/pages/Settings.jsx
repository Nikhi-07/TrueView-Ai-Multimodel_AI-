import { useState } from 'react';
import { Camera, Mic, Bell, Palette, Shield, HardDrive, Settings as SettingsIcon } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';

const tabs = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'camera', label: 'Camera & Video', icon: Camera },
  { id: 'audio', label: 'Audio & Voice', icon: Mic },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'storage', label: 'Data & Storage', icon: HardDrive },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('camera');

  return (
    <div className="max-w-5xl">
      <PageHeader title="System Settings" subtitle="Configure system parameters and AI models" breadcrumb={['TrueView AI', 'Settings']} />
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Sidebar Nav */}
        <div className="space-y-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
                  ${isActive ? 'bg-primary-500/10 text-primary-400 shadow-[inset_2px_0_0_#3b82f6]' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'}`}
              >
                <Icon size={16} /> {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content Area */}
        <div className="md:col-span-3">
          <div className="glass p-6 min-h-[500px]">
            {activeTab === 'camera' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h3 className="text-lg font-bold text-gray-100 mb-1">Camera Configuration</h3>
                  <p className="text-sm text-gray-500 mb-6">Manage video input and AI processing parameters.</p>
                </div>
                
                <div className="space-y-5">
                  <div className="flex items-center justify-between p-4 bg-surface-900/50 rounded-xl border border-white/[0.04]">
                    <div>
                      <div className="text-sm font-medium text-gray-200">Face Detection Threshold</div>
                      <div className="text-xs text-gray-500">Minimum confidence score required for identity verification.</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-primary-400">0.85</span>
                      <input type="range" min="0" max="100" defaultValue="85" className="accent-primary-500" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-surface-900/50 rounded-xl border border-white/[0.04]">
                    <div>
                      <div className="text-sm font-medium text-gray-200">Head Pose Estimation</div>
                      <div className="text-xs text-gray-500">Track pitch, yaw, and roll to detect looking away.</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" value="" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-surface-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-surface-900/50 rounded-xl border border-white/[0.04]">
                    <div>
                      <div className="text-sm font-medium text-gray-200">Object Detection Mode</div>
                      <div className="text-xs text-gray-500">Select which objects trigger alerts (e.g., phones, books).</div>
                    </div>
                    <select className="input-glass text-sm">
                      <option>Strict (All restricted objects)</option>
                      <option>Moderate (Phones & Devices)</option>
                      <option>Relaxed</option>
                    </select>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/[0.06] flex justify-end">
                  <button className="btn-primary text-sm px-6">Save Changes</button>
                </div>
              </div>
            )}
            
            {activeTab !== 'camera' && (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 animate-fade-in">
                <SettingsIcon size={48} className="mb-4 opacity-20" />
                <p className="text-sm">This section is currently under construction.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
