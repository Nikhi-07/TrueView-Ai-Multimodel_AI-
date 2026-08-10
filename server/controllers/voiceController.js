// controllers/voiceController.js
const User = require('../models/User');
const axios = require('axios');

// @desc    Verify live audio against the authenticated user's registered voice profile
// @route   POST /api/voice/verify-live-speaker
// @access  Private
const verifyLiveSpeaker = async (req, res, next) => {
  try {
    const { audio } = req.body;

    if (!audio) {
      return res.status(400).json({ message: 'Live audio recording is required' });
    }

    const user = await User.findById(req.user.id).select('+voiceEmbeddings');
    if (!user || !user.voiceEmbeddings || user.voiceEmbeddings.length === 0) {
      return res.status(400).json({ message: 'No voice profile registered for this account.' });
    }

    const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const matchThreshold = parseFloat(process.env.VOICE_MATCH_THRESHOLD || '0.75');

    const aiRes = await axios.post(`${aiUrl}/api/voice-detection/verify-speaker`, {
      audio,
      candidate: user.voiceEmbeddings[0],
      threshold: matchThreshold
    });

    const data = aiRes.data || {};
    return res.json({
      verified: Boolean(data.verified),
      confidence: data.confidence || 0,
      speechDetected: Boolean(data.speech_detected),
      quality: data.quality || 'Unknown',
      model: data.model || 'custom-acoustic-vector',
      message: data.message || 'Speaker verification completed',
    });
  } catch (error) {
    if (error.response) {
      return res.status(503).json({ message: 'Voice verification service unavailable.', detail: error.response.data?.detail });
    }
    next(error);
  }
};

// @desc    Analyze a live audio sample for speaker identity + multiple speakers
// @route   POST /api/voice/analyze-audio
// @access  Private
const analyzeLiveAudio = async (req, res, next) => {
  try {
    const { audio } = req.body;
    if (!audio) {
      return res.status(400).json({ message: 'Live audio recording is required' });
    }

    const user = await User.findById(req.user.id).select('+voiceEmbeddings');
    const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

    // 1. Speaker + multiple-speaker analysis
    const aiRes = await axios.post(`${aiUrl}/api/voice-detection/analyze-audio`, { audio });
    const data = aiRes.data || {};

    // 2. Identity match against the registered profile (embeddings never leave the server)
    let verified = false;
    let confidence = 0;
    let model = data.model || 'custom-acoustic-vector';
    if (user && user.voiceEmbeddings && user.voiceEmbeddings.length > 0) {
      const matchThreshold = parseFloat(process.env.VOICE_MATCH_THRESHOLD || '0.75');
      const verifyRes = await axios.post(`${aiUrl}/api/voice-detection/verify-speaker`, {
        audio,
        candidate: user.voiceEmbeddings[0],
        threshold: matchThreshold,
      });
      verified = Boolean(verifyRes.data && verifyRes.data.verified);
      confidence = verifyRes.data?.confidence || 0;
      model = verifyRes.data?.model || model;
    }

    return res.json({
      verified,
      confidence,
      speechDetected: Boolean(data.speech_detected),
      multipleSpeakers: Boolean(data.multiple_speakers),
      speakerCount: data.speaker_count || 1,
      quality: data.quality || 'Unknown',
      model,
      message: data.message || 'Audio analysis completed',
    });
  } catch (error) {
    if (error.response) {
      return res.status(503).json({ message: 'Voice analysis service unavailable.', detail: error.response.data?.detail });
    }
    next(error);
  }
};

// @desc    Transcribe a speech segment (Whisper) + keyword analysis
// @route   POST /api/voice/analyze-speech
// @access  Private
const analyzeSpeech = async (req, res, next) => {
  try {
    const { audio, keywords } = req.body;
    if (!audio) {
      return res.status(400).json({ message: 'Audio recording is required' });
    }

    const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const aiRes = await axios.post(`${aiUrl}/api/speech-analysis/transcribe`, {
      audio,
      keywords: Array.isArray(keywords) ? keywords : undefined,
    });

    const data = aiRes.data || {};
    return res.json({
      available: Boolean(data.available),
      transcript: data.transcript || '',
      language: data.language || 'unknown',
      durationSec: data.duration_sec || 0,
      keywordsFound: data.keywords_found || [],
      model: data.model || 'unavailable',
      message: data.message || 'Transcription completed',
    });
  } catch (error) {
    if (error.response) {
      return res.status(503).json({ message: 'Speech analysis service unavailable.', detail: error.response.data?.detail });
    }
    next(error);
  }
};

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
  verifyLiveSpeaker,
  analyzeLiveAudio,
  analyzeSpeech,
};
