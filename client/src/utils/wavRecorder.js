/**
 * Web Audio API PCM WAV Encoder & Recorder
 * Converts live microphone input into standard 16kHz mono 16-bit RIFF PCM WAV format.
 */

/**
 * Downsamples audio buffer float32 array to target sample rate (default 16000 Hz)
 */
export function downsampleBuffer(buffer, inputSampleRate, outputSampleRate = 16000) {
  if (inputSampleRate === outputSampleRate) {
    return buffer;
  }
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

/**
 * Encodes Float32Array PCM samples into standard 16-bit Mono PCM RIFF WAV ArrayBuffer / Blob.
 */
export function encodeWAV(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM = 1) */
  view.setUint16(20, 1, true);
  /* channel count (1 = Mono) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sampleRate * 1 channel * 2 bytes per sample) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (1 channel * 2 bytes) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  /* Float to 16-bit PCM conversion */
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Helper to convert Blob to Base64 data URL string
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

/**
 * Creates a recorder session using Web Audio API to collect microphone audio.
 */
export class WAVAudioRecorder {
  constructor(stream, targetSampleRate = 16000) {
    this.stream = stream;
    this.targetSampleRate = targetSampleRate;
    this.audioContext = null;
    this.scriptProcessor = null;
    this.mediaStreamSource = null;
    this.recordedSamples = [];
    this.isRecording = false;
  }

  start(onLevelUpdate) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass();
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.stream);
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.recordedSamples = [];
    this.isRecording = true;

    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.isRecording) return;
      const inputBuffer = event.inputBuffer.getChannelData(0);
      const samplesCopy = new Float32Array(inputBuffer);
      this.recordedSamples.push(samplesCopy);

      if (onLevelUpdate) {
        let sum = 0;
        for (let i = 0; i < samplesCopy.length; i++) {
          sum += samplesCopy[i] * samplesCopy[i];
        }
        const rms = Math.sqrt(sum / samplesCopy.length);
        const normalizedLevel = Math.min(100, Math.round(rms * 400));
        onLevelUpdate(normalizedLevel);
      }
    };

    this.mediaStreamSource.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
  }

  async stop() {
    this.isRecording = false;

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
    }
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
    }
    if (this.audioContext) {
      const nativeSampleRate = this.audioContext.sampleRate;
      await this.audioContext.close();
      this.audioContext = null;

      // Concatenate float arrays
      let totalLen = 0;
      for (const chunk of this.recordedSamples) {
        totalLen += chunk.length;
      }
      const merged = new Float32Array(totalLen);
      let offset = 0;
      for (const chunk of this.recordedSamples) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      // Downsample to 16,000 Hz mono
      const downsampled = downsampleBuffer(merged, nativeSampleRate, this.targetSampleRate);

      // Encode as 16-bit PCM WAV Blob
      const wavBlob = encodeWAV(downsampled, this.targetSampleRate);
      const base64Wav = await blobToBase64(wavBlob);

      return {
        blob: wavBlob,
        base64: base64Wav,
        samples: downsampled,
        sampleRate: this.targetSampleRate,
        durationSec: downsampled.length / this.targetSampleRate
      };
    }

    return null;
  }
}
