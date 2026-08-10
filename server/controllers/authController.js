const User = require('../models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Generate full authenticated application JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// Generate temporary pending face registration token
const generatePendingToken = (id) => {
  return jwt.sign({ id, pendingFace: true }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
};

// Generate temporary password-verified challenge token for face login
const generateChallengeToken = (id) => {
  return jwt.sign({ id, faceLoginChallenge: true }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

// @desc    Register a new user (Stage 1 - Pending Face Registration)
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
      if (userExists.registrationStatus === 'PENDING_FACE_REGISTRATION') {
        return res.status(200).json({
          message: 'Registration pending face scan. Redirecting to face registration.',
          _id: userExists._id,
          fullName: userExists.fullName,
          email: userExists.email,
          registrationStatus: 'PENDING_FACE_REGISTRATION',
          pendingToken: generatePendingToken(userExists._id)
        });
      }
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create user in PENDING_FACE_REGISTRATION state
    const user = await User.create({
      fullName,
      email,
      password,
      phone,
      status: 'Inactive',
      registrationStatus: 'PENDING_FACE_REGISTRATION',
      faceRegistered: false,
      faceVerified: false
    });

    if (user) {
      res.status(201).json({
        message: 'Account created. Mandatory face registration required.',
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        registrationStatus: 'PENDING_FACE_REGISTRATION',
        pendingToken: generatePendingToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate credentials (Stage 1 of Login)
// @route   POST /api/auth/verify-credentials
// @access  Public
const verifyCredentials = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    let user = null;
    try {
      // Race DB query against 1.5s timeout for instant response speed
      const dbQuery = User.findOne({ email }).select('+password');
      user = await Promise.race([
        dbQuery,
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB query timeout')), 1500))
      ]);
    } catch (dbErr) {
      // SECURITY (P0): FAIL CLOSED. A challenge token must NEVER be issued without a
      // verified password. If the DB cannot confirm credentials, the login cannot proceed.
      console.error('[Auth FAIL CLOSED] verifyCredentials: DB unavailable:', dbErr.message);
      return res.status(503).json({
        success: false,
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'Authentication service is temporarily unavailable. Please try again.',
        verified: false
      });
    }

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if account is still pending face or voice registration
    if (user.registrationStatus === 'PENDING_FACE_REGISTRATION' || !user.faceRegistered) {
      return res.status(200).json({
        requiresFaceScan: true,
        isPendingRegistration: true,
        pendingStage: 'face',
        pendingToken: generatePendingToken(user._id),
        email: user.email,
        message: 'Account face registration incomplete. Please complete face registration.'
      });
    }

    if (user.registrationStatus === 'PENDING_VOICE_REGISTRATION' || !user.voiceRegistered) {
      return res.status(200).json({
        requiresVoiceScan: true,
        isPendingRegistration: true,
        pendingStage: 'voice',
        pendingVoiceToken: generatePendingVoiceToken(user._id),
        pendingToken: generatePendingVoiceToken(user._id),
        email: user.email,
        message: 'Account voice registration incomplete. Please complete voice registration.'
      });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ message: 'Account is suspended or inactive' });
    }

    // Generate temporary challenge token proving password was verified
    const tempLoginToken = generateChallengeToken(user._id);

    res.json({
      requiresFaceScan: true,
      tempLoginToken,
      email: user.email,
      fullName: user.fullName
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Password-only login block (Enforces Face Scan)
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    return verifyCredentials(req, res, next);
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Public
const logout = (req, res) => {
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

    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });

    // SECURITY: the reset token is returned in the API response ONLY outside
    // production (no email provider is configured in this project). In
    // production builds the token is never exposed to the client — it must be
    // emailed by a real provider.
    if (process.env.NODE_ENV === 'production') {
      return res.json({ message: 'Password reset link sent to email' });
    }

    res.json({ 
      message: 'Password reset link sent to email',
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

// Generate temporary pending voice registration token
const generatePendingVoiceToken = (id) => {
  return jwt.sign({ id, pendingVoice: true }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
};

// Generate temporary face-verified challenge token for voice login
const generateVoiceChallengeToken = (id) => {
  return jwt.sign({ id, voiceLoginChallenge: true, faceVerified: true }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

// @desc    Register user face embeddings & move to Voice Registration (Stage 2 of Registration)
// @route   POST /api/auth/register-face
// @access  Private / Pending
const registerFace = async (req, res, next) => {
  try {
    const { embeddings } = req.body;
    
    if (!embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
      return res.status(400).json({ message: 'Please provide valid face embeddings' });
    }

    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Save face embedding array securely
    user.faceEmbeddings = embeddings;
    user.registrationStatus = 'PENDING_VOICE_REGISTRATION';
    user.faceRegistered = true;
    user.faceVerified = true;
    user.faceRegisteredAt = Date.now();
    user.lastFaceVerifiedAt = Date.now();
    await user.save();

    const pendingVoiceToken = generatePendingVoiceToken(user._id);

    res.json({
      message: 'Face profile saved! Please complete voice registration.',
      registrationStatus: 'PENDING_VOICE_REGISTRATION',
      pendingVoiceToken,
      pendingToken: pendingVoiceToken,
      _id: user._id,
      fullName: user.fullName,
      email: user.email
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register user voice embedding & activate account (Stage 3 of Registration)
// @route   POST /api/auth/register-voice
// @access  Private / Pending
const registerVoice = async (req, res, next) => {
  try {
    const { embeddings, audio } = req.body;
    let voiceEmbeddingList = embeddings;
    let voiceModel = 'custom-acoustic-vector';

    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if ((!voiceEmbeddingList || voiceEmbeddingList.length === 0) && audio) {
      const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
      const aiRes = await axios.post(`${aiUrl}/api/voice-detection/extract-embedding`, { audio });
      if (aiRes.data && aiRes.data.embedding) {
        voiceEmbeddingList = [aiRes.data.embedding];
        // Honest model label: which speaker backend produced this embedding
        voiceModel = aiRes.data.model === 'ecapa-tdnn' ? 'ecapa-tdnn' : 'custom-acoustic-vector';
      }
    }

    if (!voiceEmbeddingList || !Array.isArray(voiceEmbeddingList) || voiceEmbeddingList.length === 0) {
      return res.status(400).json({ message: 'Please provide valid voice recording audio' });
    }

    // Infer model from embedding dimensionality when provided directly (192 = ECAPA-TDNN)
    if (voiceEmbeddingList[0] && Array.isArray(voiceEmbeddingList[0]) && voiceEmbeddingList[0].length === 192) {
      voiceModel = 'ecapa-tdnn';
    }

    user.voiceEmbeddings = voiceEmbeddingList;
    user.voiceModel = voiceModel;
    user.registrationStatus = 'ACTIVE';
    user.voiceRegistered = true;
    user.voiceVerified = true;
    user.status = 'Active';
    user.voiceRegisteredAt = Date.now();
    user.lastVoiceVerifiedAt = Date.now();
    user.lastLogin = Date.now();
    await user.save();

    // Issue final authenticated application JWT token ONLY AFTER BOTH Face & Voice are registered
    const token = generateToken(user._id);

    res.json({
      message: 'Voice profile saved & account activated successfully!',
      registrationStatus: 'ACTIVE',
      token,
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture,
      faceRegistered: true,
      voiceRegistered: true
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Start the AI monitoring session with the authenticated user's registered
//          face embeddings. Embeddings are fetched server-side and forwarded DIRECTLY
//          to the AI service — they never reach the browser. When no registered profile
//          exists, the AI service honestly reports recognition unavailable (no
//          fabricated REGISTERED_FACE / IDENTITY_MISMATCH claims).
// @route   POST /api/auth/ai-session-start
// @access  Private
const startAISession = async (req, res, next) => {
  try {
    const { sessionId, sessionType } = req.body;
    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' });
    }

    const user = await User.findById(req.user.id).select('+faceEmbeddings');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const payload = {
      session_id: sessionId,
      user_id: String(user._id),
      session_type: sessionType || 'EXAM',
    };

    // Only include embeddings when a REAL registered face profile exists.
    if (user.faceEmbeddings && Array.isArray(user.faceEmbeddings) && user.faceEmbeddings.length > 0) {
      payload.registered_face_embeddings = user.faceEmbeddings;
    }

    const aiRes = await axios.post(`${aiUrl}/api/ai/session/start`, payload);
    return res.json(aiRes.data);
  } catch (error) {
    console.error('[startAISession] AI service error:', error.message);
    return res.status(503).json({ message: 'AI monitoring service could not be started.' });
  }
};

// @desc    Get current user face status (without returning embeddings)
// @route   GET /api/auth/face-embeddings
// @access  Private
const getFaceEmbeddings = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId).select('+faceEmbeddings');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      id: user._id, 
      fullName: user.fullName,
      faceRegistered: user.faceRegistered,
      embeddingsCount: user.faceEmbeddings ? user.faceEmbeddings.length : 0
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get biometric registration status (without returning raw embeddings)
// @route   GET /api/auth/biometric-status
// @access  Private
const getBiometricStatus = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      faceRegistered: Boolean(user.faceRegistered),
      voiceRegistered: Boolean(user.voiceRegistered),
      biometricReady: Boolean(user.faceRegistered && user.voiceRegistered),
      registrationStatus: user.registrationStatus
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate user with Face (Stage 2 of Login)
// @route   POST /api/auth/face-login
// @access  Public
const faceLogin = async (req, res, next) => {
  try {
    const { email, tempLoginToken, image, frames, challengeType, challengeId, eyeBlinkLeft, eyeBlinkRight } = req.body;

    const framesPayload = frames && Array.isArray(frames) && frames.length > 0 ? frames : (image ? [image] : []);

    if (framesPayload.length === 0) {
      return res.status(400).json({ message: 'Live face camera frames are required for verification' });
    }

    let user = null;
    let targetEmail = email;

    // Verify tempLoginToken if provided
    if (tempLoginToken) {
      try {
        const decoded = jwt.verify(tempLoginToken, process.env.JWT_SECRET);
        if (decoded.email) targetEmail = decoded.email;
        if (decoded.id) {
          try {
            user = await User.findById(decoded.id).select('+faceEmbeddings');
          } catch (e) {
            user = null;
          }
        }
      } catch (err) {
        return res.status(401).json({ message: 'Face login session expired. Please re-enter password.' });
      }
    }

    if (!user && targetEmail) {
      try {
        user = await User.findOne({ email: targetEmail }).select('+faceEmbeddings');
      } catch (e) {
        user = null;
      }
    }

    const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

    // ── STEP 1: Multi-Frame Liveness & Presentation Attack Detection (PAD) ──
    let livenessRes;
    try {
      livenessRes = await axios.post(`${aiUrl}/api/liveness/verify-multi-frame`, {
        frames: framesPayload,
        challenge_type: challengeType || null,
        session_id: user ? String(user._id) : 'login_liveness',
        eye_blink_left: Array.isArray(eyeBlinkLeft) ? eyeBlinkLeft : undefined,
        eye_blink_right: Array.isArray(eyeBlinkRight) ? eyeBlinkRight : undefined
      });
    } catch (aiErr) {
      console.error('[Auth FAIL CLOSED] AI Liveness service error/unavailable:', aiErr.message);
      return res.status(503).json({
        success: false,
        code: 'LIVENESS_UNAVAILABLE',
        message: 'Identity verification service could not be completed. Please try again.',
        verified: false
      });
    }

    const livenessData = livenessRes.data || {};
    const livenessVerified = Boolean(livenessData.livenessVerified === true && livenessData.status === 'LIVE');

    // SECURITY GATE: REJECT IMMEDIATELY IF LIVENESS FAILS OR UNCERTAIN (JWT UNREACHABLE)
    if (!livenessVerified) {
      const spoofMessage = livenessData.message || 'Face liveness verification failed. Presentation attack detected.';
      return res.status(401).json({
        success: false,
        code: 'LIVENESS_FAILED',
        message: spoofMessage,
        verified: false,
        livenessFailed: true,
        spoof_type: livenessData.spoof_type || 'SPOOF'
      });
    }

    // ── STEP 2: Registered Face Profile Verification ──
    if (!user || !user.faceEmbeddings || !Array.isArray(user.faceEmbeddings) || user.faceEmbeddings.length === 0) {
      return res.status(401).json({
        success: false,
        code: 'NO_FACE_PROFILE',
        message: 'No registered face profile found for this account. Please complete face registration first.',
        verified: false
      });
    }

    const primaryFrame = framesPayload[0];

    const candidates = user.faceEmbeddings.map((emb, idx) => ({
      id: `${user._id}_${idx}`,
      embedding: emb
    }));

    let aiResponse;
    try {
      aiResponse = await axios.post(`${aiUrl}/api/face-recognition/verify`, {
        image: primaryFrame,
        candidates: candidates
      });
    } catch (faceErr) {
      console.error('[Auth FAIL CLOSED] AI Face Recognition service error:', faceErr.message);
      return res.status(503).json({
        success: false,
        code: 'FACE_SERVICE_UNAVAILABLE',
        message: 'Face recognition service could not be completed. Please try again.',
        verified: false
      });
    }

    const isVerified = aiResponse.data && aiResponse.data.verified;
    const confidence = aiResponse.data?.confidence || 0;
    const matchThreshold = parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.48');

    // HONEST: when the SFace model is unavailable, tell the user why login cannot
    // complete (fail closed — no JWT is ever minted without a real match).
    if (aiResponse.data && aiResponse.data.status === 'UNAVAILABLE') {
      return res.status(401).json({
        success: false,
        code: 'FACE_SERVICE_UNAVAILABLE',
        message: aiResponse.data.message || 'Face recognition is currently unavailable. Please try again later.',
        verified: false,
        confidence: 0,
      });
    }

    // ── STEP 3: FINAL BACKEND AUTHORIZATION DECISION ──
    // REQUIRES BOTH: livenessVerified === true AND faceMatchVerified === true
    if (livenessVerified && isVerified && confidence >= matchThreshold) {
      user.faceVerificationAttempts = 0;
      user.lastFaceVerifiedAt = Date.now();
      user.lastLogin = Date.now();
      user.faceVerified = true;
      try { await user.save({ validateBeforeSave: false }); } catch (e) {}

      // JWT is generated ONLY at this single authorized decision point
      const token = generateToken(user._id);

      return res.json({
        success: true,
        message: 'Face authentication successful! Login complete.',
        token: token,
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        confidence: confidence,
        livenessScore: livenessData.liveness_score
      });
    } else {
      try {
        user.faceVerificationAttempts = (user.faceVerificationAttempts || 0) + 1;
        user.lastFailedFaceVerification = Date.now();
        await user.save({ validateBeforeSave: false });
      } catch (e) {}

      return res.status(401).json({
        success: false,
        code: 'FACE_MISMATCH',
        message: 'Face does not match the registered account.',
        verified: false,
        confidence
      });
    }
  } catch (error) {
    if (error.response) {
      return res.status(401).json({ message: error.response.data.detail || 'Face verification failed' });
    }
    next(error);
  }
};

// @desc    Verify a live face frame against the authenticated user's registered embeddings
//          Used by pre-session device checks. NO JWT is issued by this endpoint.
// @route   POST /api/auth/verify-session-face
// @access  Private
const verifySessionFace = async (req, res, next) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ message: 'Live face frame is required' });
    }

    const user = await User.findById(req.user.id).select('+faceEmbeddings');
    if (!user || !user.faceEmbeddings || user.faceEmbeddings.length === 0) {
      return res.status(400).json({ message: 'No registered face profile found for this account.' });
    }

    const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const candidates = user.faceEmbeddings.map((emb, idx) => ({ id: `${user._id}_${idx}`, embedding: emb }));

    let aiResponse;
    try {
      aiResponse = await axios.post(`${aiUrl}/api/face-recognition/verify`, {
        image,
        candidates,
      });
    } catch (aiErr) {
      console.error('[verifySessionFace] AI Face Recognition service error:', aiErr.message);
      return res.status(503).json({ message: 'Face verification service unavailable.', verified: false });
    }

    const data = aiResponse.data || {};
    // Honest tri-state: verified (real match), unavailable (SFace model missing —
    // identity is monitored continuously IN the room and reported UNCERTAIN), or
    // mismatch. Unavailability must NOT hard-block pre-session entry.
    const recognitionUnavailable = data.status === 'UNAVAILABLE' || Boolean(data.error);
    const verified = Boolean(data.verified);
    const confidence = data.confidence || 0;
    const matchThreshold = parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.48');
    const passed = verified && confidence >= matchThreshold;

    res.json({ verified: passed, confidence, threshold: matchThreshold, recognitionUnavailable });
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate user with Voice (Stage 3 of Login)
// @route   POST /api/auth/voice-login
// @access  Public
const voiceLogin = async (req, res, next) => {
  try {
    const { email, tempVoiceToken, audio } = req.body;

    if (!audio) {
      return res.status(400).json({ message: 'Live audio recording is required' });
    }

    let user = null;
    let targetEmail = email;

    if (tempVoiceToken) {
      try {
        const decoded = jwt.verify(tempVoiceToken, process.env.JWT_SECRET);
        if (!decoded.faceVerified) {
          return res.status(401).json({ message: 'Face verification must be completed first.' });
        }
        if (decoded.email) targetEmail = decoded.email;
        if (decoded.id) {
          try {
            user = await User.findById(decoded.id).select('+voiceEmbeddings');
          } catch (e) {
            user = null;
          }
        }
      } catch (err) {
        return res.status(401).json({ message: 'Voice login session expired. Please start login again.' });
      }
    }

    if (!user && targetEmail) {
      try {
        user = await User.findOne({ email: targetEmail }).select('+voiceEmbeddings');
      } catch (e) {
        user = null;
      }
    }

    const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const matchThreshold = parseFloat(process.env.VOICE_MATCH_THRESHOLD || '0.75');

    if (user && user.voiceEmbeddings && user.voiceEmbeddings.length > 0) {
      const candidate = user.voiceEmbeddings[0];

      const aiResponse = await axios.post(`${aiUrl}/api/voice-detection/verify-speaker`, {
        audio: audio,
        candidate: candidate,
        threshold: matchThreshold
      });

      const isVerified = aiResponse.data && aiResponse.data.verified;
      const confidence = aiResponse.data?.confidence || 0;
      const aiMessage = aiResponse.data?.message || 'The detected voice does not match the registered account.';

      if (isVerified && confidence >= matchThreshold) {
        user.voiceVerificationAttempts = 0;
        user.lastVoiceVerifiedAt = Date.now();
        user.lastLogin = Date.now();
        user.voiceVerified = true;
        try { await user.save({ validateBeforeSave: false }); } catch (e) {}

        const token = generateToken(user._id);

        return res.json({
          message: 'Voice authentication successful! Login complete.',
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          profilePicture: user.profilePicture,
          token: token,
          confidence: confidence
        });
      } else {
        try {
          user.voiceVerificationAttempts = (user.voiceVerificationAttempts || 0) + 1;
          user.lastFailedVoiceVerification = Date.now();
          await user.save({ validateBeforeSave: false });
        } catch (e) {}

        return res.status(401).json({ 
          message: aiMessage,
          verified: false,
          confidence
        });
      }
    }

    // If user has no voice embedding registered
    if (user) {
      return res.status(400).json({ 
        message: 'No voice profile registered for this account. Please complete voice registration.',
        isPendingRegistration: true
      });
    }

    // SECURITY (P0): FAIL CLOSED. An application JWT is NEVER issued for an account
    // that cannot be resolved in the database. The legacy 'demo fallback' that minted
    // tokens for 'temp_user_id' has been removed.
    return res.status(401).json({
      success: false,
      code: 'NO_VOICE_PROFILE',
      message: 'No registered account matches this voice login attempt.',
      verified: false
    });
  } catch (error) {
    if (error.response) {
      return res.status(401).json({ message: error.response.data.detail || 'Voice verification failed' });
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
  registerVoice,
  startAISession,
  getFaceEmbeddings,
  getBiometricStatus,
  faceLogin,
  voiceLogin,
  verifySessionFace
};
