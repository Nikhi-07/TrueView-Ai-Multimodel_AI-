// @desc    Log an Object Detection proctoring session event
// @route   POST /api/object-detection/log
// @access  Private
const logObjectDetectionEvent = async (req, res, next) => {
  try {
    const {
      sessionId,
      objectsDetected,
      personCount,
      personStatus,
      phoneDetected,
      laptopDetected,
      bookDetected,
      prohibitedItemsCount,
      prohibitedItemsList,
      processingTimeMs,
    } = req.body;

    console.log(
      `[YOLO] Session: ${sessionId}, ` +
      `Objects: ${objectsDetected}, ` +
      `People: ${personCount} (${personStatus.toUpperCase()}), ` +
      `Phone: ${phoneDetected ? '⚠️ YES' : 'NO'}, ` +
      `Laptop: ${laptopDetected ? 'YES' : 'NO'}, ` +
      `Book: ${bookDetected ? '⚠️ YES' : 'NO'}, ` +
      `Prohibited: ${prohibitedItemsCount} (${prohibitedItemsList.join(', ')}), ` +
      `Time: ${processingTimeMs}ms`
    );

    res.json({
      message: 'Object detection event logged successfully',
      sessionId,
      personCount,
      prohibitedItemsCount,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  logObjectDetectionEvent,
};
