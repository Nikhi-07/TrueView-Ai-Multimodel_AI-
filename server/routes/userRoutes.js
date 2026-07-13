const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, deleteAccount, getUsers } = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');

// Protected routes
router.route('/profile')
  .get(protect, getProfile)
  .put(protect, updateProfile);

router.delete('/account', protect, deleteAccount);

// Admin only routes
router.route('/')
  .get(protect, admin, getUsers);

module.exports = router;
