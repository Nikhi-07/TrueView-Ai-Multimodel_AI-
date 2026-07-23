"""
Performance Benchmarking Tool – TrueView AI Engine

Measures execution FPS, per-module latency, CPU/RAM usage, and dropped frame metrics.
"""

import time
import os
import psutil
from typing import Dict, Any


class PerformanceBenchmarker:
    """
    Tracks real-time system resource utilization and latency.
    """

    def capture_metrics(self, start_ts: float, end_ts: float) -> Dict[str, Any]:
        latency_ms = round((end_ts - start_ts) * 1000.0, 1)
        process = psutil.Process(os.getpid())
        mem_mb = round(process.memory_info().rss / (1024.0 * 1024.0), 1)
        cpu_pct = process.cpu_percent(interval=None)

        return {
            "latency_ms": latency_ms,
            "memory_usage_mb": mem_mb,
            "cpu_percent": cpu_pct,
            "fps": round(1000.0 / max(1.0, latency_ms), 1),
        }
