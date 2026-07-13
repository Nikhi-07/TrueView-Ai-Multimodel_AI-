// @desc    Log a Voice Activity Detection (VAD) proctoring session event
// @route   POST /api/voice/log
// @access  Private
const logVoiceEvent = async (req, res, next) => {
  try {
    const {
      sessionId,
      voiceStatus,
      confidence,
      volumeRms,
      noiseLevel,
      speakingDuration,
      silenceDuration,
      speakingRatioPct,
      currentPattern,
      multipleVoicesDetected,
      processingTimeMs,
    } = req.body;

    console.log(
      `[VoiceVAD] Session: ${sessionId}, ` +
      `Status: ${voiceStatus.toUpperCase()} (conf: ${(confidence * 100).toFixed(0)}%), ` +
      `Volume: ${volumeRms.toFixed(4)}, ` +
      `Floor: ${noiseLevel.toFixed(4)}, ` +
      `Speaking: ${speakingDuration}s (${speakingRatioPct}%), ` +
      `Silence: ${silenceDuration}s, ` +
      `Pattern: ${currentPattern}, ` +
      `Multi-Voice: ${multipleVoicesDetected ? '⚠️ YES' : 'NO'}, ` +
      `Time: ${processingTimeMs}ms`
    );

    res.json({
      message: 'Voice VAD event logged successfully',
      sessionId,
      voiceStatus,
      currentPattern,
      multipleVoicesDetected,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  logVoiceEvent,
};
