require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/trueview');
    console.log('MongoDB connected for seeding...');

    // Admin credentials come from environment variables (ADMIN_EMAIL /
    // ADMIN_PASSWORD). The fallbacks are DEVELOPMENT-ONLY defaults.
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@trueview.ai').toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'password123';

    if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
      console.error('Refusing to seed with the default password in production. Set ADMIN_PASSWORD.');
      process.exit(1);
    }

    // Check if admin already exists
    const adminExists = await User.findOne({ email: adminEmail });
    if (adminExists) {
      console.log('Admin user already exists. Password might have been changed.');
      process.exit(0);
    }

    // The Mongoose pre-save hook hashes the raw password with bcrypt.
    await User.create({
      fullName: 'System Admin',
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
      status: 'Active'
    });

    console.log(`Admin user seeded successfully (${adminEmail}).`);
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin user:', error);
    process.exit(1);
  }
};

seedAdmin();
