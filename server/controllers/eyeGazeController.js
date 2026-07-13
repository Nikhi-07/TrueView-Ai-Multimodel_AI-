// @desc    Log an Eye Gaze tracking session event
// @route   POST /api/eye-gaze/log
// @access  Private
const logEyeGazeEvent = async (req, res, next) => {
  try {
    const {
      sessionId,
      gazeDirection,
      attentionStatus,
      attentionScore,
      focusDuration,
      confidence,
      processingTimeMs,
    } = req.body;

    console.log(
      `[EyeGaze] Session: ${sessionId}, ` +
      `Direction: ${gazeDirection}, ` +
      `Status: ${attentionStatus}, ` +
      `Score: ${attentionScore}%, ` +
      `Focus: ${focusDuration}s, ` +
      `Confidence: ${confidence}, ` +
      `Time: ${processingTimeMs}ms`
    );

    res.json({
      message: 'Eye Gaze event logged',
      sessionId,
      gazeDirection,
      attentionStatus,
      attentionScore,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  logEyeGazeEvent,
};
