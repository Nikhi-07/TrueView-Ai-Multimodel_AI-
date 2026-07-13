require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/trueview');
    console.log('MongoDB connected for seeding...');

    // Check if admin already exists
    const adminExists = await User.findOne({ email: 'admin@trueview.ai' });
    if (adminExists) {
      console.log('Admin user already exists. Password might have been changed.');
      process.exit(0);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    // Create admin user
    // Note: Mongoose pre-save hook also hashes password. We should pass raw password if using pre-save hook, 
    // or use insertMany to bypass hook. Since we have a pre-save hook in User.js, we should pass raw password.
    await User.create({
      fullName: 'System Admin',
      email: 'admin@trueview.ai',
      password: 'password123', // Raw password, pre-save hook will hash it
      role: 'admin',
      status: 'Active'
    });

    console.log('Admin user seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin user:', error);
    process.exit(1);
  }
};

seedAdmin();
