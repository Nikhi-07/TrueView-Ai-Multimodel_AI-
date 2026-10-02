const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

mongoose.connect('mongodb://127.0.0.1:27017/trueview').then(async () => {
  const User = require('./models/User');
  const hashed = await bcrypt.hash('Admin@123456', 10);
  await User.updateOne({ email: 'admin@trueview.ai' }, { $set: { password: hashed } });
  console.log('Admin password reset to: Admin@123456');

  // Verify sessions list works with admin
  const http = require('http');
  const loginData = JSON.stringify({ email: 'admin@trueview.ai', password: 'Admin@123456' });
  const req = http.request({ hostname:'localhost', port:5000, path:'/api/auth/login', method:'POST',
    headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(loginData)} }, (res) => {
    let body = ''; res.on('data', c => body+=c); res.on('end', () => {
      const r = JSON.parse(body);
      if (!r.token) { console.log('Still failed:', body); mongoose.disconnect(); return; }
      console.log('Login OK! User:', r.user?.email);
      // Check sessions
      const sReq = http.request({ hostname:'localhost', port:5000, path:'/api/ai-engine/sessions?filter=ALL', method:'GET',
        headers:{'Authorization':'Bearer '+r.token} }, (r2) => {
        let d2=''; r2.on('data',c=>d2+=c); r2.on('end',()=>{
          const s = JSON.parse(d2);
          console.log('Total sessions:', s.count);
          const ext = (s.sessions||[]).filter(x => x.source==='EXTENSION' || (x.sessionId||'').includes('EXT-TEST'));
          console.log('Extension test sessions:', ext.length);
          ext.forEach(x => console.log('  Session:', x.sessionId, '| Status:', x.status, '| Report:', x.hasReport, x.reportId||''));
          // Check reports
          const rReq = http.request({ hostname:'localhost', port:5000, path:'/api/reports', method:'GET',
            headers:{'Authorization':'Bearer '+r.token} }, (r3) => {
            let d3=''; r3.on('data',c=>d3+=c); r3.on('end',()=>{
              const rp = JSON.parse(d3);
              console.log('Total reports:', rp.reports?.length ?? 0);
              const extR = (rp.reports||[]).filter(x => (x.sessionId||'').includes('EXT-TEST'));
              extR.forEach(x => console.log('  Report:', x.reportId, '| Score:', x.overallIntegrityScore, '| Status:', x.status));
              mongoose.disconnect();
            });
          }); rReq.end();
        });
      }); sReq.end();
    });
  }); req.write(loginData); req.end();
}).catch(e => { console.error(e.message); process.exit(1); });
