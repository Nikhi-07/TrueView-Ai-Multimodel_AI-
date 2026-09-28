const mongoose = require('./server/node_modules/mongoose');

async function fix() {
  await mongoose.connect('mongodb://127.0.0.1:27017/trueview');
  const res = await mongoose.connection.collection('rooms').updateMany(
    {
      $or: [
        { title: 'null' },
        { title: null },
        { title: '' },
        { title: 'undefined' }
      ]
    },
    {
      $set: { title: 'Computer Science Examination' }
    }
  );
  console.log('Fixed rooms count:', res.modifiedCount);

  // Specifically check TRV-9606
  const trv9606 = await mongoose.connection.collection('rooms').findOne({ roomId: 'TRV-9606' });
  console.log('TRV-9606 room title:', trv9606?.title);

  await mongoose.disconnect();
}

fix().catch(console.error);
