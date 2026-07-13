import cv2
import numpy as np

class TextureDetector:
    """
    Detects spoofing artifacts using frequency-domain analysis (FFT) and
    Local Binary Pattern (LBP) texture statistics.
    
    Key insight: Real human skin has rich, random high-frequency texture.
    Printed photos lose high-frequency detail due to printer DPI limitations.
    Screen replays introduce Moiré interference patterns visible in the FFT spectrum.
    """

    def __init__(self):
        # Thresholds tuned for typical webcam captures
        self.fft_energy_threshold = 15.0   # Below this = likely flat/printed
        self.lbp_variance_threshold = 30.0 # Below this = likely synthetic

    def process(self, frame: np.ndarray, face_box: dict) -> dict:
        """
        Analyze the texture of the face crop for spoofing artifacts.
        Returns texture_score (0-100), and individual sub-scores.
        """
        x, y, w, h = face_box["x"], face_box["y"], face_box["width"], face_box["height"]
        fh, fw = frame.shape[:2]

        # Clamp to image bounds
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(fw, x + w), min(fh, y + h)

        face_crop = frame[y1:y2, x1:x2]
        if face_crop.size == 0 or face_crop.shape[0] < 20 or face_crop.shape[1] < 20:
            return {"texture_score": 0.0, "fft_energy": 0.0, "lbp_variance": 0.0, "detail": "face_too_small"}

        # Resize to standard 128x128 for consistent analysis
        face_resized = cv2.resize(face_crop, (128, 128))
        gray = cv2.cvtColor(face_resized, cv2.COLOR_BGR2GRAY).astype(np.float64)

        # --- 1. FFT High-Frequency Energy ---
        fft_energy = self._compute_fft_energy(gray)

        # --- 2. LBP Variance (simplified) ---
        lbp_variance = self._compute_lbp_variance(gray.astype(np.uint8))

        # --- 3. Laplacian Variance (sharpness/focus) ---
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        # --- Combined Texture Score ---
        # Normalize each sub-score to 0-100 range and average
        fft_norm = min(100.0, (fft_energy / self.fft_energy_threshold) * 50.0)
        lbp_norm = min(100.0, (lbp_variance / self.lbp_variance_threshold) * 50.0)
        laplacian_norm = min(100.0, laplacian_var / 10.0)  # typical real faces have var > 500

        texture_score = (fft_norm * 0.4 + lbp_norm * 0.3 + laplacian_norm * 0.3)
        texture_score = min(100.0, max(0.0, texture_score))

        return {
            "texture_score": round(texture_score, 2),
            "fft_energy": round(fft_energy, 4),
            "lbp_variance": round(lbp_variance, 4),
            "laplacian_variance": round(laplacian_var, 4),
        }

    def _compute_fft_energy(self, gray: np.ndarray) -> float:
        """
        Compute the ratio of high-frequency energy in the 2D FFT spectrum.
        Real faces have richer high-frequency content than flat/printed surfaces.
        """
        # Apply windowing to reduce spectral leakage
        rows, cols = gray.shape
        crow, ccol = rows // 2, cols // 2

        f = np.fft.fft2(gray)
        fshift = np.fft.fftshift(f)
        magnitude_spectrum = np.abs(fshift)

        # Total energy
        total_energy = np.sum(magnitude_spectrum)
        if total_energy == 0:
            return 0.0

        # Mask out the low-frequency center (DC + low freqs)
        mask_radius = min(rows, cols) // 6  # inner ~16% of spectrum is low-freq
        y_grid, x_grid = np.ogrid[:rows, :cols]
        center_mask = ((y_grid - crow) ** 2 + (x_grid - ccol) ** 2) <= mask_radius ** 2

        high_freq_energy = np.sum(magnitude_spectrum[~center_mask])
        ratio = (high_freq_energy / total_energy) * 100.0

        return ratio

    def _compute_lbp_variance(self, gray: np.ndarray) -> float:
        """
        Compute a simplified Local Binary Pattern variance.
        Real skin has high LBP variance due to pores, hair, wrinkles.
        Flat surfaces have low LBP variance.
        """
        # Simple 3x3 LBP
        h, w = gray.shape
        lbp = np.zeros((h - 2, w - 2), dtype=np.uint8)

        # 8 neighbors
        offsets = [(-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1)]

        for i, (dy, dx) in enumerate(offsets):
            neighbor = gray[1 + dy:h - 1 + dy, 1 + dx:w - 1 + dx]
            center = gray[1:h - 1, 1:w - 1]
            lbp |= ((neighbor >= center).astype(np.uint8) << i)

        return float(np.var(lbp))
