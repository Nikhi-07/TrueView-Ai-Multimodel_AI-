// @desc    Log a Behavioural Analytics event
// @route   POST /api/behaviour/log
// @access  Private
const logBehaviourEvent = async (req, res, next) => {
  try {
    const {
      sessionId,
      metrics,
      activeEvents,
      sessionSummary,
    } = req.body;

    // Log the current summary and active frame flags
    const activeFlagTypes = activeEvents.map(e => e.type).join(', ') || 'None';
    
    console.log(
      `[Behaviour] Session: ${sessionId}, ` +
      `Attention: ${metrics.attention_pct}%, ` +
      `Rating: ${sessionSummary.attention_rating}, ` +
      `Insight: ${sessionSummary.behavioral_insight}, ` +
      `Active Flags: [${activeFlagTypes}], ` +
      `Focus Time: ${metrics.focus_duration_seconds}s, ` +
      `Speaking: ${metrics.speaking_duration_seconds}s, ` +
      `Face Lost: ${metrics.face_loss_seconds}s`
    );

    res.json({
      message: 'Behaviour analytics event logged successfully',
      sessionId,
      attentionPct: metrics.attention_pct,
      behavioralInsight: sessionSummary.behavioral_insight,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  logBehaviourEvent,
};
