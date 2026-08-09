"""
Speaker Recognizer – TrueView AI

Extracts normalized 128-dimensional acoustic speaker embeddings (d-vectors)
capturing fundamental frequency (F0 pitch statistics), formant frequencies (F1/F2/F3 vocal tract resonances),
MFCCs (Mel-Frequency Cepstral Coefficients static, delta, delta-delta with CMVN), 
spectral centroid, bandwidth, roll-off, zero-crossing rate, and harmonics-to-noise ratio.
"""

import base64
import io
import wave
import numpy as np

class SpeakerRecognizer:
    def __init__(self, embedding_dim: int = 128, target_sr: int = 16000):
        self.embedding_dim = embedding_dim
        self.target_sr = target_sr

    def decode_audio(self, audio_data: str) -> tuple[np.ndarray, int]:
        """
        Decode base64 encoded PCM WAV audio into float32 mono samples normalized to [-1.0, 1.0].
        """
        if not audio_data:
            return np.zeros(0, dtype=np.float32), self.target_sr

        if "," in audio_data:
            audio_data = audio_data.split(",", 1)[1]

        try:
            raw_bytes = base64.b64decode(audio_data)
        except Exception:
            return np.zeros(0, dtype=np.float32), self.target_sr

        # Primary Decoding: Parse standard RIFF WAV header
        try:
            with wave.open(io.BytesIO(raw_bytes), "rb") as wf:
                sr = wf.getframerate()
                num_frames = wf.getnframes()
                width = wf.getsampwidth()
                channels = wf.getnchannels()
                raw_frames = wf.readframes(num_frames)

                if width == 2:
                    samples = np.frombuffer(raw_frames, dtype=np.int16).astype(np.float32) / 32768.0
                elif width == 4:
                    samples = np.frombuffer(raw_frames, dtype=np.float32)
                elif width == 1:
                    samples = (np.frombuffer(raw_frames, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
                else:
                    samples = np.frombuffer(raw_frames, dtype=np.int16).astype(np.float32) / 32768.0

                if channels > 1:
                    samples = samples.reshape(-1, channels).mean(axis=1)

                # Resample to target_sr if necessary
                if sr != self.target_sr and len(samples) > 1 and sr > 0:
                    num_target = int(len(samples) * self.target_sr / float(sr))
                    orig_indices = np.linspace(0, len(samples) - 1, len(samples))
                    target_indices = np.linspace(0, len(samples) - 1, num_target)
                    samples = np.interp(target_indices, orig_indices, samples).astype(np.float32)
                    sr = self.target_sr

                return samples, sr
        except Exception:
            pass

        # Fallback Decoding: Parse raw PCM int16 or float32 buffer if RIFF header is missing
        try:
            if len(raw_bytes) % 2 == 0:
                samples = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                return samples, self.target_sr
        except Exception:
            pass

        return np.zeros(0, dtype=np.float32), self.target_sr

    def compute_mfcc(self, spectrum: np.ndarray, num_filterbanks: int = 13, sr: int = 16000) -> np.ndarray:
        """
        Compute 13 Mel-Frequency Cepstral Coefficients from FFT magnitude spectrum.
        """
        num_fft = len(spectrum)
        mel_min = 0
        mel_max = 2595 * np.log10(1 + (sr / 2.0) / 700)
        mel_points = np.linspace(mel_min, mel_max, num_filterbanks + 2)
        hz_points = 700 * (10**(mel_points / 2595) - 1)
        bins = np.floor((num_fft - 1) * hz_points / (sr / 2.0)).astype(int)

        fbanks = np.zeros((num_filterbanks, num_fft))
        for m in range(1, num_filterbanks + 1):
            f_m_minus = bins[m - 1]
            f_m = bins[m]
            f_m_plus = bins[m + 1]

            for k in range(f_m_minus, f_m):
                fbanks[m - 1, k] = (k - bins[m - 1]) / max(1, (bins[m] - bins[m - 1]))
            for k in range(f_m, f_m_plus):
                if k < num_fft:
                    fbanks[m - 1, k] = (bins[m + 1] - k) / max(1, (bins[m + 1] - bins[m]))

        filter_energies = np.dot(fbanks, spectrum)
        filter_energies = np.where(filter_energies <= 0, 1e-10, filter_energies)
        log_energies = np.log(filter_energies)

        # DCT-II
        n = len(log_energies)
        mfcc = np.zeros(n)
        for i in range(n):
            mfcc[i] = np.sum(log_energies * np.cos(np.pi * i * (np.arange(n) + 0.5) / n))

        return mfcc

    def estimate_lpc_formants(self, frame: np.ndarray, sr: int = 16000, order: int = 10) -> tuple[float, float, float]:
        """
        Estimate Formant Frequencies F1, F2, F3 using Linear Predictive Coding (LPC) spectral roots.
        """
        if len(frame) < order + 1:
            return 500.0, 1500.0, 2500.0

        autocorr = np.correlate(frame, frame, mode='full')
        autocorr = autocorr[len(frame)-1 : len(frame) - 1 + order + 1]
        if autocorr[0] <= 1e-8:
            return 500.0, 1500.0, 2500.0

        a = np.zeros(order + 1, dtype=np.float32)
        a[0] = 1.0
        e = autocorr[0]

        for k in range(1, order + 1):
            lam = 0.0
            for j in range(k):
                lam -= a[j] * autocorr[k - j]
            lam /= max(1e-8, e)
            a_new = a.copy()
            for j in range(1, k):
                a_new[j] += lam * a[k - j]
            a_new[k] = lam
            a = a_new
            e *= (1.0 - lam * lam)
            if e <= 1e-8:
                break

        freqs = np.fft.rfftfreq(512, 1.0 / sr)
        lpc_spectrum = 1.0 / np.abs(np.fft.rfft(a, 512) + 1e-6)

        peaks = []
        for i in range(1, len(lpc_spectrum) - 1):
            if lpc_spectrum[i] > lpc_spectrum[i - 1] and lpc_spectrum[i] > lpc_spectrum[i + 1]:
                freq = freqs[i]
                if freq > 150: # Ignore low sub-harmonic peak
                    peaks.append(freq)

        f1 = peaks[0] if len(peaks) > 0 else 500.0
        f2 = peaks[1] if len(peaks) > 1 else 1500.0
        f3 = peaks[2] if len(peaks) > 2 else 2500.0

        return f1, f2, f3

    def extract_speaker_embedding(self, audio_data: str) -> dict:
        """
        Extract normalized 128-D acoustic speaker d-vector capturing pitch stats, formants,
        CMVN MFCCs, spectral envelope, and harmonic identity metrics.
        """
        samples, sr = self.decode_audio(audio_data)
        duration_sec = len(samples) / float(sr) if sr > 0 else 0.0

        if len(samples) < 1600:
            return {
                "embedding": [0.0] * self.embedding_dim,
                "speech_detected": False,
                "f0_median": 0.0,
                "quality": "Insufficient Audio Length",
                "duration_sec": round(duration_sec, 2),
                "samples_count": len(samples)
            }

        volume_rms = float(np.sqrt(np.mean(samples ** 2)))
        max_amp = float(np.max(np.abs(samples)))
        is_clipping = max_amp > 0.98

        frame_length = int(0.025 * sr)  # 25ms frame (400 samples at 16kHz)
        hop_length = int(0.010 * sr)    # 10ms hop (160 samples)
        num_frames = (len(samples) - frame_length) // hop_length + 1

        if num_frames < 5:
            return {
                "embedding": [0.0] * self.embedding_dim,
                "speech_detected": False,
                "f0_median": 0.0,
                "quality": "Audio Too Short",
                "duration_sec": round(duration_sec, 2),
                "samples_count": len(samples)
            }

        mfcc_frames = []
        pitch_estimates = []
        centroids = []
        bandwidths = []
        rolloffs = []
        zcrs = []
        hnrs = []
        formants_f1 = []
        formants_f2 = []
        formants_f3 = []

        # Analyze frames & filter active voiced speech frames
        for i in range(min(num_frames, 400)):
            start = i * hop_length
            end = start + frame_length
            frame = samples[start:end]
            if len(frame) < frame_length:
                continue

            frame_rms = float(np.sqrt(np.mean(frame ** 2)))

            # Autocorrelation Pitch F0 Estimation (range 75 Hz to 380 Hz)
            pitch = 0.0
            autocorr_peak = 0.0
            if frame_rms > 0.003:
                autocorr = np.correlate(frame, frame, mode='full')
                autocorr = autocorr[len(autocorr)//2:]
                min_lag = int(sr / 380)
                max_lag = int(sr / 75)
                if max_lag < len(autocorr) and min_lag < max_lag:
                    peak_idx = min_lag + np.argmax(autocorr[min_lag:max_lag])
                    autocorr_peak = float(autocorr[peak_idx] / max(1e-6, autocorr[0]))
                    if autocorr_peak > 0.20:
                        pitch = float(sr / peak_idx)

            # Voiced Frame Criteria
            is_voiced = frame_rms > 0.004 and pitch > 75.0

            if not is_voiced and len(pitch_estimates) > 10:
                continue # Skip pure silence

            windowed = frame * np.hanning(len(frame))
            spectrum = np.abs(np.fft.rfft(windowed))
            freqs = np.fft.rfftfreq(len(frame), 1.0 / sr)
            sum_spec = float(np.sum(spectrum))

            # MFCC (13 filterbanks)
            mfcc = self.compute_mfcc(spectrum, num_filterbanks=13, sr=sr)
            mfcc_frames.append(mfcc)

            # Pitch F0
            if pitch > 75.0:
                pitch_estimates.append(pitch)

            # Spectral Centroid
            centroid = float(np.sum(freqs * spectrum) / max(1e-6, sum_spec))
            centroids.append(centroid)

            # Spectral Bandwidth
            bandwidth = float(np.sqrt(np.sum(((freqs - centroid) ** 2) * spectrum) / max(1e-6, sum_spec)))
            bandwidths.append(bandwidth)

            # Spectral Roll-off (85%)
            cum_energy = np.cumsum(spectrum)
            threshold_energy = 0.85 * sum_spec
            rolloff_idx = np.where(cum_energy >= threshold_energy)[0]
            rolloff = float(freqs[rolloff_idx[0]]) if len(rolloff_idx) > 0 else 0.0
            rolloffs.append(rolloff)

            # Zero Crossing Rate
            diffs = np.diff(np.sign(frame))
            zcr = float(np.sum(diffs != 0)) / (2.0 * len(frame))
            zcrs.append(zcr)

            # Harmonics-to-Noise Ratio (HNR)
            safe_peak = max(1e-4, min(0.999, autocorr_peak))
            hnr = float(10.0 * np.log10(safe_peak / (1.0 - safe_peak)))
            hnrs.append(hnr)

            # Formant Frequencies F1, F2, F3
            if is_voiced:
                f1, f2, f3 = self.estimate_lpc_formants(windowed, sr=sr)
                formants_f1.append(f1)
                formants_f2.append(f2)
                formants_f3.append(f3)

        has_speech = len(pitch_estimates) >= 3 and volume_rms >= 0.003

        if not has_speech or len(mfcc_frames) == 0:
            return {
                "embedding": [0.0] * self.embedding_dim,
                "speech_detected": False,
                "f0_median": 0.0,
                "quality": "No Clear Speech Voiced Frames Detected",
                "duration_sec": round(duration_sec, 2),
                "samples_count": len(samples)
            }

        # ── Compute Acoustic Feature Matrices ──
        mfcc_arr = np.array(mfcc_frames)  # (N, 13)

        # Apply Cepstral Mean & Variance Normalization (CMVN)
        mfcc_cmvn = (mfcc_arr - np.mean(mfcc_arr, axis=0)) / (np.std(mfcc_arr, axis=0) + 1e-6)

        mfcc_means = np.mean(mfcc_cmvn, axis=0)      # 13
        mfcc_stds = np.std(mfcc_cmvn, axis=0)        # 13
        mfcc_medians = np.median(mfcc_cmvn, axis=0)  # 13
        mfcc_iqrs = np.percentile(mfcc_cmvn, 75, axis=0) - np.percentile(mfcc_cmvn, 25, axis=0) # 13

        # Delta & Delta-Delta MFCCs
        if len(mfcc_cmvn) > 1:
            deltas = np.diff(mfcc_cmvn, axis=0)
            delta_means = np.mean(deltas, axis=0)    # 13
            delta_stds = np.std(deltas, axis=0)      # 13
        else:
            delta_means = np.zeros(13)
            delta_stds = np.zeros(13)

        if len(deltas) > 1:
            delta_deltas = np.diff(deltas, axis=0)
            delta2_means = np.mean(delta_deltas, axis=0) # 13
        else:
            delta2_means = np.zeros(13)

        # Pitch (F0) Statistics
        f0_median = float(np.median(pitch_estimates)) if len(pitch_estimates) > 0 else 150.0
        f0_mean = float(np.mean(pitch_estimates)) if len(pitch_estimates) > 0 else 150.0
        f0_std = float(np.std(pitch_estimates)) if len(pitch_estimates) > 0 else 15.0
        f0_iqr = float(np.percentile(pitch_estimates, 75) - np.percentile(pitch_estimates, 25)) if len(pitch_estimates) > 0 else 10.0

        # Formant Statistics & Ratios
        f1_median = float(np.median(formants_f1)) if len(formants_f1) > 0 else 500.0
        f2_median = float(np.median(formants_f2)) if len(formants_f2) > 0 else 1500.0
        f3_median = float(np.median(formants_f3)) if len(formants_f3) > 0 else 2500.0

        ratio_f2_f1 = f2_median / max(1.0, f1_median)
        ratio_f3_f2 = f3_median / max(1.0, f2_median)

        # Spectral Envelope Metrics
        centroid_mean = float(np.mean(centroids)) if len(centroids) > 0 else 1500.0
        centroid_std = float(np.std(centroids)) if len(centroids) > 0 else 200.0
        bandwidth_mean = float(np.mean(bandwidths)) if len(bandwidths) > 0 else 1000.0
        rolloff_mean = float(np.mean(rolloffs)) if len(rolloffs) > 0 else 3000.0
        zcr_mean = float(np.mean(zcrs)) if len(zcrs) > 0 else 0.05
        hnr_mean = float(np.mean(hnrs)) if len(hnrs) > 0 else 15.0

        # ── Feature Normalization & Assembly (Z-Score & Bounds Scaling) ──
        norm_f0_median = (f0_median - 150.0) / 100.0
        norm_f0_mean = (f0_mean - 150.0) / 100.0
        norm_f0_std = f0_std / 50.0
        norm_f0_iqr = f0_iqr / 30.0

        norm_ratio_f2_f1 = (ratio_f2_f1 - 3.0) / 1.5
        norm_ratio_f3_f2 = (ratio_f3_f2 - 1.7) / 0.8
        norm_f1 = (f1_median - 500.0) / 300.0
        norm_f2 = (f2_median - 1500.0) / 600.0
        norm_f3 = (f3_median - 2500.0) / 800.0

        norm_centroid = (centroid_mean - 1800.0) / 1000.0
        norm_centroid_std = centroid_std / 500.0
        norm_bandwidth = (bandwidth_mean - 1200.0) / 600.0
        norm_rolloff = (rolloff_mean - 3500.0) / 1500.0
        norm_zcr = (zcr_mean - 0.08) / 0.05
        norm_hnr = (hnr_mean - 15.0) / 10.0

        # Pitch & Formant Identity Block (weighted x2.5 for strong pitch discriminability)
        pitch_formant_block = 2.5 * np.array([
            norm_f0_median, norm_f0_mean, norm_f0_std, norm_f0_iqr,
            norm_f1, norm_f2, norm_f3, norm_ratio_f2_f1, norm_ratio_f3_f2,
            norm_centroid, norm_centroid_std, norm_bandwidth, norm_rolloff, norm_zcr, norm_hnr
        ], dtype=np.float32) # 15 features

        # Concatenate acoustic feature blocks
        speaker_features = np.concatenate([
            mfcc_means,         # 13
            mfcc_stds,          # 13
            mfcc_medians,       # 13
            mfcc_iqrs,          # 13
            delta_means,        # 13
            delta_stds,         # 13
            delta2_means,       # 13
            pitch_formant_block # 15
        ]) # Total = 106 features

        # Replace any potential inf or nan with 0.0
        speaker_features = np.nan_to_num(speaker_features, nan=0.0, posinf=0.0, neginf=0.0)

        # Pad or trim to exact 128 dimensions
        if len(speaker_features) < self.embedding_dim:
            pad = np.zeros(self.embedding_dim - len(speaker_features), dtype=np.float32)
            speaker_features = np.concatenate([speaker_features, pad])
        else:
            speaker_features = speaker_features[:self.embedding_dim]

        # Final L2 Unit Normalization
        norm = float(np.linalg.norm(speaker_features))
        if norm > 1e-6:
            speaker_features = speaker_features / norm

        quality = "Good Speech Quality"
        if is_clipping:
            quality = "Audio Clipping Detected"
        elif volume_rms < 0.005:
            quality = "Low Speech Volume"

        return {
            "embedding": speaker_features.tolist(),
            "speech_detected": has_speech,
            "f0_median": round(f0_median, 1),
            "f0_std": round(f0_std, 1),
            "formant_f1": round(f1_median, 1),
            "formant_f2": round(f2_median, 1),
            "quality": quality,
            "duration_sec": round(duration_sec, 2),
            "volume_rms": round(volume_rms, 4),
            "samples_count": len(samples)
        }

    def verify_speaker(self, audio_data: str, candidate_embedding: list, threshold: float = 0.75) -> dict:
        """
        Verify live audio speaker embedding against registered candidate_embedding via cosine similarity 
        plus fundamental pitch & acoustic identity guardrails.
        """
        extracted = self.extract_speaker_embedding(audio_data)

        if not extracted["speech_detected"]:
            return {
                "verified": False,
                "confidence": 0.0,
                "threshold": threshold,
                "speech_detected": False,
                "quality": extracted.get("quality", "No Speech"),
                "duration_sec": extracted.get("duration_sec", 0.0),
                "message": "No clear speech detected in recording. Please speak the phrase aloud clearly."
            }

        live_emb = np.array(extracted["embedding"], dtype=np.float32)
        cand_emb = np.array(candidate_embedding, dtype=np.float32)

        if len(cand_emb) != len(live_emb):
            cand_emb = np.resize(cand_emb, live_emb.shape)

        norm_live = np.linalg.norm(live_emb)
        norm_cand = np.linalg.norm(cand_emb)

        if norm_live < 1e-6 or norm_cand < 1e-6:
            similarity = 0.0
        else:
            similarity = float(np.dot(live_emb, cand_emb) / (norm_live * norm_cand))

        # Acoustic Pitch Guardrail: Extract stored norm_f0_median (feature index 91)
        live_f0 = extracted.get("f0_median", 0.0)
        cand_f0_norm = float(cand_emb[91]) / 2.5 if len(cand_emb) > 91 else 0.0
        cand_f0 = cand_f0_norm * 100.0 + 150.0

        # Calculate pitch difference penalty if both have valid pitch estimates
        if live_f0 > 75.0 and cand_f0 > 75.0:
            pitch_diff = abs(live_f0 - cand_f0)
            if pitch_diff > 25.0:
                penalty = max(0.15, 1.0 - (pitch_diff - 25.0) / 45.0)
                similarity = similarity * penalty

        similarity = max(0.0, min(1.0, similarity))
        verified = bool(similarity >= threshold)

        message = "Voice identity successfully verified." if verified else "Voice biometric mismatch. The detected voice signature does not match the registered profile."

        return {
            "verified": verified,
            "confidence": round(similarity, 4),
            "threshold": threshold,
            "speech_detected": True,
            "f0_median": live_f0,
            "quality": extracted.get("quality", "Good"),
            "duration_sec": extracted.get("duration_sec", 0.0),
            "message": message
        }
