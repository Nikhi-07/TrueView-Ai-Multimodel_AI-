// @desc    Log a liveness check result
// @route   POST /api/liveness/log
// @access  Private
const logLivenessResult = async (req, res, next) => {
  try {
    const { sessionId, liveness, confidence, blinkCount, motionScore, textureScore } = req.body;
    
    // In production you'd save this to a LivenessLog collection.
    // For now, we just acknowledge it.
    console.log(`[Liveness] Session: ${sessionId}, Result: ${liveness}, Confidence: ${confidence}%`);
    
    res.json({ 
      message: 'Liveness result logged', 
      sessionId, 
      liveness, 
      confidence 
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get liveness status for a session
// @route   GET /api/liveness/status/:sessionId
// @access  Private
const getLivenessStatus = async (req, res, next) => {
  try {
    // Placeholder – in production, query a LivenessLog collection.
    res.json({ 
      sessionId: req.params.sessionId, 
      status: 'Active', 
      lastCheck: new Date().toISOString() 
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  logLivenessResult,
  getLivenessStatus
};
