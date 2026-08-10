"""
TrueView AI – Resource Monitor (Phase 3)

Samples CPU% and RSS (MB) of the Node server (port 5000) and the AI service
(port 8000) processes every `interval` seconds for `duration` seconds, then
prints a summary (min/mean/max). Designed to run in the background while the
concurrent-session load test executes.

Usage:
    python monitor_resources.py --duration 90 --interval 1
"""
import argparse
import json
import time

import psutil


def find_process_on_port(port):
    for conn in psutil.net_connections(kind="inet"):
        if conn.laddr and conn.laddr.port == port and conn.status == "LISTEN":
            try:
                return psutil.Process(conn.pid)
            except psutil.Error:
                return None
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--duration", type=int, default=90)
    ap.add_argument("--interval", type=float, default=1.0)
    ap.add_argument("--out", default="results/resource_usage.json")
    args = ap.parse_args()

    node = find_process_on_port(5000)
    ai = find_process_on_port(8000)
    print(f"[monitor] node_pid={getattr(node, 'pid', None)} ai_pid={getattr(ai, 'pid', None)}")

    samples = {"node": [], "ai": []}
    start = time.time()
    while time.time() - start < args.duration:
        row = {"t": round(time.time() - start, 1)}
        if node:
            try:
                row["cpu"] = node.cpu_percent(interval=None)
                row["rss_mb"] = round(node.memory_info().rss / 1e6, 1)
            except psutil.Error:
                pass
        samples["node"].append(row)
        row2 = {"t": round(time.time() - start, 1)}
        if ai:
            try:
                row2["cpu"] = ai.cpu_percent(interval=None)
                row2["rss_mb"] = round(ai.memory_info().rss / 1e6, 1)
            except psutil.Error:
                pass
        samples["ai"].append(row2)
        time.sleep(args.interval)

    def summarize(rows):
        if not rows or "cpu" not in rows[0]:
            return {"status": "NOT MEASURED"}
        cpus = [r["cpu"] for r in rows if "cpu" in r]
        rss = [r["rss_mb"] for r in rows if "rss_mb" in r]
        return {
            "samples": len(rows),
            "cpu_min": round(min(cpus), 1),
            "cpu_mean": round(sum(cpus) / len(cpus), 1),
            "cpu_max": round(max(cpus), 1),
            "rss_min_mb": round(min(rss), 1),
            "rss_mean_mb": round(sum(rss) / len(rss), 1),
            "rss_max_mb": round(max(rss), 1),
        }

    report = {"node_server": summarize(samples["node"]), "ai_service": summarize(samples["ai"]), "samples": samples}
    with open(args.out, "w") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
