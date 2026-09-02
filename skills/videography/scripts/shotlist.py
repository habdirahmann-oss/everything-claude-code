#!/usr/bin/env python3
"""
Shotlist-generator.

Downloadt een (YouTube-)video, detecteert de shots (scène-overgangen) en maakt
van elke shot één referentie-screenshot. Levert op:
  - screenshots/shot_001.jpg, shot_002.jpg, ...   (één per shot)
  - shotlist.html                                  (visuele shotlist in de browser)
  - shotlist.csv                                   (shot #, tijdcode, bestand)

Vereisten (eenmalig installeren):
    pip install yt-dlp imageio-ffmpeg

Gebruik:
    python3 shotlist.py "https://youtu.be/_GSc3uAm8rQ"

Opties:
    --threshold 0.30   Gevoeligheid shot-detectie (0.2 = veel shots, 0.4 = weinig).
    --outdir ./shotlist_output
"""

import argparse
import csv
import html
import os
import re
import subprocess
import sys


def sh(cmd):
    print("  $", " ".join(cmd))
    subprocess.run(cmd, check=True)


def ffmpeg_bin():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"  # val terug op systeem-ffmpeg


def tc(seconds):
    """Seconden -> HH:MM:SS.mmm tijdcode."""
    ms = int((seconds - int(seconds)) * 1000)
    s = int(seconds)
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}.{ms:03d}"


def download(url, outdir):
    target = os.path.join(outdir, "source.%(ext)s")
    sh([sys.executable, "-m", "yt_dlp",
        "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        "--merge-output-format", "mp4",
        "-o", target, url])
    for f in os.listdir(outdir):
        if f.startswith("source."):
            return os.path.join(outdir, f)
    raise FileNotFoundError("Download mislukt: geen source-bestand gevonden.")


def detect_shots(video, threshold, ff):
    """Detecteer shot-grenzen met ffmpeg's scene-detectie. Geeft starttijden terug."""
    cmd = [ff, "-i", video, "-filter:v",
           f"select='gt(scene,{threshold})',showinfo",
           "-f", "null", "-"]
    print("  $", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    times = [0.0]
    for m in re.finditer(r"pts_time:([0-9.]+)", proc.stderr):
        t = float(m.group(1))
        if t - times[-1] > 0.5:  # negeer dubbels binnen 0,5s
            times.append(t)
    return times


def grab(video, when, path, ff):
    sh([ff, "-ss", f"{when:.3f}", "-i", video, "-frames:v", "1",
        "-q:v", "2", "-y", path])


def write_html(shots, outdir):
    rows = []
    for i, (t, img) in enumerate(shots, 1):
        rows.append(f"""
      <figure>
        <img src="screenshots/{html.escape(os.path.basename(img))}" loading="lazy">
        <figcaption><b>Shot {i:03d}</b><br>{tc(t)}</figcaption>
      </figure>""")
    doc = f"""<!doctype html><meta charset="utf-8">
<title>Shotlist ({len(shots)} shots)</title>
<style>
  body{{font-family:system-ui,sans-serif;margin:24px;background:#111;color:#eee}}
  h1{{font-size:20px}}
  .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}}
  figure{{margin:0;background:#1c1c1c;border-radius:8px;overflow:hidden}}
  img{{width:100%;display:block;aspect-ratio:16/9;object-fit:cover}}
  figcaption{{padding:8px 10px;font-size:13px;line-height:1.4}}
</style>
<h1>Shotlist — {len(shots)} shots</h1>
<div class="grid">{''.join(rows)}</div>"""
    with open(os.path.join(outdir, "shotlist.html"), "w") as f:
        f.write(doc)


def write_csv(shots, outdir):
    with open(os.path.join(outdir, "shotlist.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["shot", "timecode", "seconds", "file"])
        for i, (t, img) in enumerate(shots, 1):
            w.writerow([i, tc(t), f"{t:.3f}", os.path.basename(img)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--threshold", type=float, default=0.30)
    ap.add_argument("--outdir", default="shotlist_output")
    args = ap.parse_args()

    os.makedirs(os.path.join(args.outdir, "screenshots"), exist_ok=True)
    ff = ffmpeg_bin()

    print("1/4  Video downloaden ...")
    video = download(args.url, args.outdir)

    print("2/4  Shots detecteren ...")
    times = detect_shots(video, args.threshold, ff)
    print(f"     {len(times)} shots gevonden.")

    print("3/4  Screenshots trekken ...")
    shots = []
    for i, t in enumerate(times, 1):
        img = os.path.join(args.outdir, "screenshots", f"shot_{i:03d}.jpg")
        grab(video, t + 0.15, img, ff)  # kleine offset, mist de harde cut
        shots.append((t, img))

    print("4/4  Shotlist schrijven ...")
    write_html(shots, args.outdir)
    write_csv(shots, args.outdir)

    print(f"\nKlaar! Open: {os.path.join(args.outdir, 'shotlist.html')}")


if __name__ == "__main__":
    main()
