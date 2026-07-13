// @desc    Log a Face Mesh session event
// @route   POST /api/face-mesh/log
// @access  Private
const logFaceMeshEvent = async (req, res, next) => {
  try {
    const { sessionId, landmarkCount, processingTimeMs } = req.body;
    console.log(`[FaceMesh] Session: ${sessionId}, Detected landmarks: ${landmarkCount}, Time: ${processingTimeMs}ms`);
    res.json({
      message: 'Face Mesh event logged',
      sessionId,
      landmarkCount
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  logFaceMeshEvent
};
