// @desc    Log a Head Pose tracking session event
// @route   POST /api/head-pose/log
// @access  Private
const logHeadPoseEvent = async (req, res, next) => {
  try {
    const {
      sessionId,
      pitch,
      yaw,
      roll,
      headDirection,
      attentionStatus,
      screenFacingRatio,
      headStability,
      movementFrequency,
      processingTimeMs,
    } = req.body;

    console.log(
      `[HeadPose] Session: ${sessionId}, ` +
      `Pitch: ${pitch > 0 ? '+' : ''}${pitch}°, ` +
      `Yaw: ${yaw > 0 ? '+' : ''}${yaw}°, ` +
      `Roll: ${roll > 0 ? '+' : ''}${roll}°, ` +
      `Dir: ${headDirection}, ` +
      `Status: ${attentionStatus}, ` +
      `Stability: ${headStability}, ` +
      `Freq: ${movementFrequency}/min, ` +
      `Facing: ${screenFacingRatio}%, ` +
      `Time: ${processingTimeMs}ms`
    );

    res.json({
      message: 'Head Pose event logged successfully',
      sessionId,
      headDirection,
      attentionStatus,
      headStability,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  logHeadPoseEvent,
};
