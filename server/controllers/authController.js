const User = require('../models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
  try {
    const { fullName, email, password, phone } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Please add all required fields' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create user
    const user = await User.create({
      fullName,
      email,
      password,
      phone,
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email }).select('+password');

    if (user && (await user.matchPassword(password))) {
      if (user.status !== 'Active') {
        return res.status(403).json({ message: 'Account is not active' });
      }

      // Update last login
      user.lastLogin = Date.now();
      await user.save({ validateBeforeSave: false });

      res.json({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Verify credentials before Face Scan
// @route   POST /api/auth/verify-credentials
// @access  Public
const verifyCredentials = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');

    if (user && (await user.matchPassword(password))) {
      if (user.status !== 'Active') {
        return res.status(403).json({ message: 'Account is not active' });
      }
      
      // If no face embeddings, maybe we should reject or allow password login?
      // Since face enrollment is forced during registration, we expect embeddings to exist.
      if (!user.faceEmbeddings || user.faceEmbeddings.length === 0) {
        return res.status(400).json({ message: 'No face profile found. Please register your face first.' });
      }

      res.json({ requiresFaceScan: true, email: user.email });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Public
const logout = (req, res) => {
  // Since we use JWT in local storage, logout is mostly handled client-side.
  // We can return a success message. 
  res.json({ message: 'Logged out successfully' });
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // In a real app, generate a reset token and send email.
    // For this scaffold, we'll return a fake token in response for testing.
    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });

    res.json({ 
      message: 'Password reset link sent to email',
      // DO NOT do this in production:
      resetToken 
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ message: 'Please provide token and new password' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('+password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.password = password;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      res.status(400).json({ message: 'Reset token expired' });
    } else {
      res.status(400).json({ message: 'Invalid token' });
    }
  }
};

// @desc    Register user face embeddings
// @route   POST /api/auth/register-face
// @access  Private
const registerFace = async (req, res, next) => {
  try {
    const { embeddings } = req.body;
    
    if (!embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
      return res.status(400).json({ message: 'Please provide face embeddings array' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.faceEmbeddings = embeddings;
    await user.save();

    res.json({ message: 'Face registered successfully', count: embeddings.length });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user face embeddings for verification
// @route   GET /api/auth/face-embeddings
// @access  Private
const getFaceEmbeddings = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      id: user._id, 
      fullName: user.fullName, 
      embeddings: user.faceEmbeddings 
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate user with Face
// @route   POST /api/auth/face-login
// @access  Public
const faceLogin = async (req, res, next) => {
  try {
    const { email, image } = req.body;

    if (!email || !image) {
      return res.status(400).json({ message: 'Please provide email and face image' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ message: 'Account is not active' });
    }

    if (!user.faceEmbeddings || user.faceEmbeddings.length === 0) {
      return res.status(400).json({ message: 'No face registered for this user. Please use password login.' });
    }

    // Format embeddings for FastAPI
    const candidates = user.faceEmbeddings.map((emb, idx) => ({
      id: `${user._id}_${idx}`,
      embedding: emb
    }));

    // Call Python FastAPI
    const aiResponse = await axios.post('http://127.0.0.1:8000/api/face-recognition/verify', {
      image: image,
      candidates: candidates
    });

    if (aiResponse.data && aiResponse.data.verified) {
      user.lastLogin = Date.now();
      await user.save({ validateBeforeSave: false });

      return res.json({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        token: generateToken(user._id),
        confidence: aiResponse.data.confidence
      });
    } else {
      return res.status(401).json({ message: 'Face verification failed' });
    }
  } catch (error) {
    if (error.response) {
      return res.status(400).json({ message: error.response.data.detail || 'Face verification failed' });
    }
    next(error);
  }
};

module.exports = {
  register,
  login,
  verifyCredentials,
  logout,
  forgotPassword,
  resetPassword,
  registerFace,
  getFaceEmbeddings,
  faceLogin
};
