import { motion } from 'framer-motion';
import { Clock, Calendar, Video, PlayCircle, AlertTriangle } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import { mockSessions } from '../utils/mockData';

export default function Sessions() {
  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } };

  return (
    <div className="space-y-6">
      <PageHeader title="Monitoring Sessions" subtitle="Active and historical examination sessions" breadcrumb={['TrueView AI', 'Sessions']} />
      
      <div className="mb-4 flex gap-4 border-b border-white/[0.06] pb-px">
         <button className="text-sm font-medium text-primary-400 border-b-2 border-primary-500 pb-3 px-2">All Sessions</button>
         <button className="text-sm font-medium text-gray-500 hover:text-gray-300 pb-3 px-2 transition-colors">Active Only</button>
         <button className="text-sm font-medium text-gray-500 hover:text-gray-300 pb-3 px-2 transition-colors">Flagged</button>
      </div>

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {mockSessions.map((session) => (
          <motion.div key={session.id} variants={item} className="glass p-5 rounded-2xl group hover:border-primary-500/30 transition-colors flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-xs font-mono text-gray-500 block mb-0.5">{session.id}</span>
                <h3 className="text-sm font-bold text-gray-100">{session.user}</h3>
              </div>
              <StatusBadge 
                label={session.status} 
                variant={session.status === 'Active' ? 'success' : session.status === 'Flagged' ? 'danger' : 'info'} 
                dot={session.status === 'Active'}
              />
            </div>

            <div className="space-y-2.5 flex-1">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Calendar size={13} className="text-gray-500" /> {new Date(session.startedAt).toLocaleDateString()}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Clock size={13} className="text-gray-500" /> Duration: <span className="font-mono text-gray-300">{session.duration}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <AlertTriangle size={13} className={session.violations > 0 ? "text-warning-400" : "text-gray-500"} /> Violations: {session.violations}
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <span className="text-[10px] text-gray-500 uppercase tracking-wider">Risk Score</span>
                 <span className={`text-xs font-bold ${session.risk > 60 ? 'text-danger-400' : session.risk > 20 ? 'text-warning-400' : 'text-success-400'}`}>{session.risk}/100</span>
               </div>
               {session.status === 'Active' ? (
                 <button className="p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"><Video size={14}/></button>
               ) : (
                 <button className="p-2 bg-surface-700 text-gray-300 rounded-lg hover:bg-surface-600 transition-colors"><PlayCircle size={14}/></button>
               )}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
