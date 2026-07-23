// @desc    Log a Decision Engine evaluation
// @route   POST /api/decision/log
// @access  Private
const logDecisionEvent = async (req, res, next) => {
  try {
    const {
      sessionId,
      riskScore,
      sessionStatus,
      action,
      reasoning,
      violationCount,
      violations,
      aiConfidence,
      moduleConfidence,
    } = req.body;

    const violationLabels = violations?.map(v => v.label).join(', ') || 'None';

    console.log(
      `[Decision Engine] Session: ${sessionId}, ` +
      `Risk: ${riskScore}/100, ` +
      `Status: ${sessionStatus}, ` +
      `Action: ${action}, ` +
      `Violations: [${violationLabels}] (${violationCount}), ` +
      `AI Confidence: ${(aiConfidence * 100).toFixed(0)}%`
    );

    res.json({
      message: 'Decision event logged successfully',
      sessionId,
      riskScore,
      sessionStatus,
      action,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  logDecisionEvent,
};
