"""
TrueView AI – Phase 3 Graph Generation

Reads the real evaluation artifacts (results/evaluation_report.json,
results/load_test.json, results/resource_usage.json) and produces PNG graphs.
Only measured data is plotted — empty categories are skipped, never invented.
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")
os.makedirs(RESULTS, exist_ok=True)

OUT = os.path.join(HERE, "graphs")
os.makedirs(OUT, exist_ok=True)


def load(name):
    p = os.path.join(RESULTS, name)
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)


def plot_blink(report):
    b = (report or {}).get("blink")
    if not b or b.get("status") != "MEASURED":
        print("[graphs] blink: skipped (NOT MEASURED)")
        return
    cm = b["confusion_matrix"]
    M = np.array([[cm["true_positive"], cm["false_negative"]],
                  [cm["false_positive"], cm["true_negative"]]])
    fig, ax = plt.subplots(figsize=(4.5, 4))
    ax.imshow(M, cmap="Blues", vmin=0)
    for i in range(2):
        for j in range(2):
            ax.text(j, i, str(M[i, j]), ha="center", va="center", fontsize=16, fontweight="bold")
    ax.set_xticks([0, 1]); ax.set_yticks([0, 1])
    ax.set_xticklabels(["Pred Blink", "Pred No-Blink"])
    ax.set_yticklabels(["Actual Blink", "Actual No-Blink"])
    ax.set_title(f"Blink Confusion Matrix (TPR {b['true_positive_rate']}, FPR {b['false_positive_rate']})")
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "blink_confusion.png"), dpi=110)
    print("[graphs] blink_confusion.png written")


def plot_pad(report):
    l = (report or {}).get("liveness")
    if not l or l.get("status") != "MEASURED" or not l.get("per_attack"):
        print("[graphs] pad: skipped (NOT MEASURED)")
        return
    cats = list(l["per_attack"].keys())
    adrs = [l["per_attack"][c]["attack_detection_rate"] for c in cats]
    fig, ax = plt.subplots(figsize=(6, 3.5))
    ax.bar(cats, [a * 100 for a in adrs], color="#334155")
    ax.set_ylim(0, 105)
    ax.set_ylabel("Attack Detection Rate (%)")
    ax.set_title(f"PAD Per-Attack ADR (overall ADR {l['overall_attack_detection_rate']})")
    for i, a in enumerate(adrs):
        ax.text(i, a * 100 + 2, f"{a:.2f}", ha="center", fontsize=10, fontweight="bold")
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "pad_attack_adr.png"), dpi=110)
    print("[graphs] pad_attack_adr.png written")


def plot_face(report):
    f = (report or {}).get("face_recognition")
    if not f or f.get("status") != "MEASURED" or not f.get("similarity_matrix"):
        print("[graphs] face: skipped (NOT MEASURED)")
        return
    sm = f["similarity_matrix"]
    names = list(sm.keys())
    M = np.array([[sm[a][b] for b in names] for a in names])
    fig, ax = plt.subplots(figsize=(4.5, 4))
    im = ax.imshow(M, cmap="RdYlGn", vmin=0, vmax=1)
    for i in range(M.shape[0]):
        for j in range(M.shape[1]):
            ax.text(j, i, f"{M[i, j]:.2f}", ha="center", va="center", fontsize=10)
    ax.set_xticks(range(len(names))); ax.set_yticks(range(len(names)))
    ax.set_xticklabels(names, rotation=45, ha="right"); ax.set_yticklabels(names)
    ax.set_title(f"Face Similarity Matrix (threshold 0.48, FAR {f.get('false_acceptance_rate')})")
    fig.colorbar(im, shrink=0.8)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "face_similarity.png"), dpi=110)
    print("[graphs] face_similarity.png written")


def plot_voice(report):
    v = (report or {}).get("voice_synthetic")
    if not v or v.get("status") != "MEASURED" or not v.get("threshold_curve"):
        print("[graphs] voice: skipped (NOT MEASURED)")
        return
    curve = v["threshold_curve"]
    ts = [c["threshold"] for c in curve]
    frr = [c["frr"] for c in curve]
    far = [c["far"] for c in curve]
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(ts, far, "o-", label="FAR", color="#dc2626")
    ax.plot(ts, frr, "s-", label="FRR", color="#2563eb")
    ax.set_xlabel("Similarity threshold"); ax.set_ylabel("Rate")
    ax.set_title("Voice FAR/FRR vs Threshold (SYNTHETIC CALIBRATION — not real-speaker EER)")
    ax.legend(); ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "voice_threshold.png"), dpi=110)
    print("[graphs] voice_threshold.png written (labeled synthetic)")


def plot_load(load_res):
    if not load_res or not load_res.get("results"):
        print("[graphs] load: skipped (no load_test.json)")
        return
    levels = [r["level"] for r in load_res["results"]]
    rtt = [r.get("ai_event_rtt_mean_ms") for r in load_res["results"]]
    join = [r.get("join_mean_ms") for r in load_res["results"]]
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(levels, rtt, "o-", label="AI event RTT (ms)", color="#7c3aed")
    ax.plot(levels, join, "s-", label="Join latency (ms)", color="#059669")
    ax.set_xlabel("Concurrent sessions"); ax.set_ylabel("Latency (ms)")
    ax.set_title("Latency vs Concurrent Sessions")
    ax.legend(); ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "load_latency.png"), dpi=110)
    print("[graphs] load_latency.png written")


def plot_resources(res, load_res):
    if not res or res.get("node_server", {}).get("status") == "NOT MEASURED":
        print("[graphs] resources: skipped (NOT MEASURED)")
        return
    node = res["node_server"]
    labels = ["CPU mean (%)", "RSS mean (MB)", "CPU max (%)", "RSS max (MB)"]
    vals = [node["cpu_mean"], node["rss_mean_mb"], node["cpu_max"], node["rss_max_mb"]]
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.bar(labels, vals, color="#0f766e")
    for i, v in enumerate(vals):
        ax.text(i, v + max(vals) * 0.02, f"{v:.1f}", ha="center", fontsize=10, fontweight="bold")
    ax.set_title("Node Server Resource Usage (across load levels)")
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "load_resources.png"), dpi=110)
    print("[graphs] load_resources.png written")


def main():
    report = load("evaluation_report.json")
    load_res = load("load_test.json")
    res = load("resource_usage.json")
    plot_blink(report)
    plot_pad(report)
    plot_face(report)
    plot_voice(report)
    plot_load(load_res)
    plot_resources(res, load_res)
    print("[graphs] done")


if __name__ == "__main__":
    main()
