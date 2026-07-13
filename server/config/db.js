// config/db.js
// MongoDB Connection Placeholder
// ─────────────────────────────────

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/trueview';

// const mongoose = require('mongoose');
// async function connectDB() {
//   await mongoose.connect(MONGO_URI);
//   console.log('MongoDB connected');
// }
// module.exports = { connectDB };

console.log(`[DB] Placeholder – MongoDB URI: ${MONGO_URI}`);
