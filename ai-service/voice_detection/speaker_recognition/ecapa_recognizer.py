"""
ECAPA-TDNN Speaker Verification Engine – TrueView AI

Loads the REAL pretrained ECAPA-TDNN speaker-embedding model from SpeechBrain
(VoxCeleb): https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb
Model repository: https://github.com/speechbrain/speechbrain (Apache-2.0)

Produces 192-dimensional L2-normalized speaker embeddings.

This module is OPTIONAL: if speechbrain/torchaudio are not installed (or the
pretrained checkpoint cannot be fetched), the class reports availability=False
and the caller falls back to the lightweight custom acoustic extractor, which is
always labeled honestly as "custom-acoustic-vector" (NOT ECAPA-TDNN).
"""

import os

import numpy as np


def _apply_torchaudio_compat():
    """
    speechbrain 0.5.x calls torchaudio.set_audio_backend() which was removed in
    torchaudio >= 2.6. We only feed raw waveforms (never file paths) so a no-op
    shim is safe and keeps SpeechBrain importable on modern torchaudio.
    """
    try:
        import torchaudio
        if not hasattr(torchaudio, "set_audio_backend"):
            torchaudio.set_audio_backend = lambda *a, **k: None
    except Exception:
        pass


class ECAPASpeakerRecognizer:
    MODEL_SOURCE = "speechbrain/spkrec-ecapa-voxceleb"
    EMBEDDING_DIM = 192
    TARGET_SR = 16000

    def __init__(self):
        self.classifier = None
        self._init_model()

    def _init_model(self):
        try:
            _apply_torchaudio_compat()
            from speechbrain.pretrained import EncoderClassifier

            savedir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pretrained_models", "spkrec-ecapa-voxceleb")
            self.classifier = EncoderClassifier.from_hparams(source=self.MODEL_SOURCE, savedir=savedir)
            print(f"[ECAPASpeakerRecognizer] Pretrained ECAPA-TDNN loaded: {self.MODEL_SOURCE}")
        except Exception as e:
            self.classifier = None
            print(f"[ECAPASpeakerRecognizer] ECAPA-TDNN unavailable ({e}). Falling back to custom acoustic extractor.")

    @property
    def available(self) -> bool:
        return self.classifier is not None

    def extract_embedding(self, samples: np.ndarray) -> list:
        """
        Extract L2-normalized 192-D ECAPA-TDNN speaker embedding from float32
        mono samples at 16kHz.
        """
        if not self.available or samples is None or len(samples) < 1600:
            return None

        try:
            import torch

            waveform = torch.from_numpy(np.asarray(samples, dtype=np.float32)).unsqueeze(0)  # (1, N)
            with torch.no_grad():
                emb = self.classifier.encode_batch(waveform)  # (1, 1, 192)
            emb = emb.squeeze(1).squeeze(0).numpy().astype(np.float32)
            norm = float(np.linalg.norm(emb))
            if norm > 1e-6:
                emb = emb / norm
            return emb.tolist()
        except Exception as e:
            print(f"[ECAPASpeakerRecognizer] Embedding extraction error: {e}")
            return None

    def verify(self, samples: np.ndarray, candidate_embedding: list, threshold: float = 0.75) -> dict:
        """
        Verify live samples against a registered ECAPA candidate embedding.
        Returns a dict compatible with the speaker router schema.
        """
        live_emb = self.extract_embedding(samples)
        if live_emb is None:
            return {
                "verified": False,
                "confidence": 0.0,
                "threshold": threshold,
                "speech_detected": False,
                "message": "No clear speech detected in recording. Please speak clearly.",
                "model": "ecapa-tdnn",
            }

        cand = np.asarray(candidate_embedding, dtype=np.float32).flatten()
        live = np.asarray(live_emb, dtype=np.float32).flatten()
        if len(cand) != len(live):
            cand = np.resize(cand, live.shape)

        n_live = float(np.linalg.norm(live))
        n_cand = float(np.linalg.norm(cand))
        similarity = float(np.dot(live, cand) / (n_live * n_cand)) if (n_live > 1e-6 and n_cand > 1e-6) else 0.0
        similarity = round(max(0.0, min(1.0, similarity)), 4)

        verified = bool(similarity >= threshold)
        return {
            "verified": verified,
            "confidence": similarity,
            "threshold": threshold,
            "speech_detected": True,
            "model": "ecapa-tdnn",
            "message": "Voice identity successfully verified by ECAPA-TDNN." if verified
                       else "Voice biometric mismatch. The detected voice signature does not match the registered profile.",
        }
