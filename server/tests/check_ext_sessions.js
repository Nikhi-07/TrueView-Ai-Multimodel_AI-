const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/trueview').then(async () => {
  const Session = require('../models/Session');
  const Report = require('../models/Report');
  
  const extSessions = await Session.find({ source: 'EXTENSION' }).sort({ createdAt: -1 }).limit(5).lean();
  console.log('=== Extension Sessions in MongoDB ===');
  console.log('Count:', extSessions.length);
  extSessions.forEach(s => console.log('  ->', s.sessionId, '|', s.status, '| room:', s.roomTitle));
  
  const extReports = await Report.find({ sessionId: /EXT-TEST/i }).sort({ createdAt: -1 }).limit(5).lean();
  console.log('\n=== Extension Test Reports in MongoDB ===');
  console.log('Count:', extReports.length);
  extReports.forEach(r => console.log('  -> Report:', r.reportId, '| Session:', r.sessionId, '| Score:', r.overallIntegrityScore, '| Status:', r.status));
  
  const recent = await Session.find({}).sort({ createdAt: -1 }).limit(5).lean();
  console.log('\n=== Recent Sessions ===');
  recent.forEach(s => console.log('  ->', s.sessionId, '| source:', s.source || 'WEB', '| status:', s.status, '| created:', s.createdAt));
  
  mongoose.disconnect();
}).catch(e => { console.error('Error:', e.message); process.exit(1); });
