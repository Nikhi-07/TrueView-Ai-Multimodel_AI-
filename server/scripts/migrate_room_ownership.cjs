const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/trueview');
    console.log('Connected to MongoDB.');

    const Room = mongoose.model('Room', new mongoose.Schema({}, { strict: false }));
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

    // 1. Delete invalid / fake test rooms like TRV-DOES-NOT-EXIST-404
    const delRes = await Room.deleteMany({ roomId: 'TRV-DOES-NOT-EXIST-404' });
    console.log('Deleted TRV-DOES-NOT-EXIST-404 rooms:', delRes.deletedCount);

    // 2. Find user Nikhil
    const nikhil = await User.findOne({ email: 'nikhil@gmail.com' });
    if (nikhil) {
      const nikhilId = String(nikhil._id);
      const updateRes = await Room.updateMany(
        {
          $or: [
            { 'host.email': 'nikhil@gmail.com' },
            { 'host.id': nikhilId }
          ]
        },
        {
          $set: {
            ownerId: nikhilId,
            ownerName: nikhil.fullName,
            ownerEmail: nikhil.email,
            createdBy: nikhilId,
            hostUserId: nikhilId,
            'host.id': nikhilId,
            'host.name': nikhil.fullName,
            'host.email': nikhil.email
          }
        }
      );
      console.log('Updated Nikhil rooms with ownerId:', updateRes.modifiedCount);
    }

    // 3. For any rooms created by Professor Turing or others, ensure ownerId = host.id
    const roomsWithoutOwner = await Room.find({ ownerId: { $exists: false } });
    for (const r of roomsWithoutOwner) {
      const oId = r.host?.id || 'admin_seed';
      r.ownerId = oId;
      r.createdBy = oId;
      r.hostUserId = oId;
      r.ownerName = r.host?.name || 'Session Host';
      r.ownerEmail = r.host?.email || '';
      await r.save();
    }
    console.log('Fixed rooms without ownerId count:', roomsWithoutOwner.length);

    console.log('Migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
})();
