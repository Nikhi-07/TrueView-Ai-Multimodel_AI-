const mongoose = require('mongoose');
const Report = require('./models/Report');
const Alert = require('./models/Alert');
const Session = require('./models/Session');
require('dotenv').config();

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.');
  
  await Report.deleteMany({});
  await Alert.deleteMany({});
  await Session.deleteMany({});
  console.log('Successfully cleared all reports, alerts, and sessions.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
