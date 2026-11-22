"""
Turn raw simulator recordings into the website's Features clips.

  python3 assets/app-clips/process.py <raw_dir> <out_dir>

For each take (<name>.mp4 + <name>.log written while recording):
  1. normalise to 30 fps and measure motion frame-to-frame,
  2. keep every moving frame (plus a little lead-in / settle), squeeze idle gaps
     (tool-call pauses between actions) down to IDLE_KEEP seconds,
  3. blur personal names, scale to 1080 wide, and add a short hold at the end,
  4. place each logged tap on the first frame where the app reacts, remapped onto
     the edited timeline, and write them to taps.json for the web player.
Posters (first / last frame) are written as WebP for instant first paint.
"""
import json, os, subprocess, sys
import numpy as np

RAW, OUT = sys.argv[1], sys.argv[2]
FPS = 30
W, H = 1206, 2622           # simulator pixels (iPhone 17 Pro @3x); 402 x 874 points
SCALE = 3.0                 # points -> pixels
OUT_W, OUT_H = 1080, 2348
IDLE_KEEP = 10              # frames of stillness kept between actions (~0.33 s)
LEAD, SETTLE = 5, 9         # frames kept before / after motion
THRESH = 0.35               # mean abs luma diff (0-255) that counts as motion

# Clip order on the site and per-clip extras.
CLIPS = {
    'find':        dict(swipes={'swipe1': (90, 480, .45), 'swipe2': (90, 480, .45)}),
    'gameday':     dict(blur=[('pill', (885, 205, 280, 135), 'until:suggestion')]),
    'book':        dict(swipes={'wheel': (201, 478, .9), 'endwheel': (300, 452, .9)}),
    'pay':         dict(),
    'reservation': dict(),
    'message':     dict(blur=[('row', (300, 465, 320, 70), 'until:thread'),
                              ('header', (205, 245, 320, 75), 'from:thread')]),
}


def motion(path):
    h = 262   # fixed analysis size so rows never misalign
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-vf', f'fps={FPS},scale=120:{h},format=gray',
           '-f', 'rawvideo', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = len(raw) // (120 * h)
    frames = np.frombuffer(raw[: n * 120 * h], np.uint8).reshape(n, h, 120).astype(np.int16)
    d = np.zeros(n)
    d[1:] = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))
    return d


def keep_frames(d):
    n = len(d)
    active = d > THRESH
    keep = np.zeros(n, bool)
    keep[: int(0.6 * FPS)] = True                        # a calm first moment
    idx = np.where(active)[0]
    for i in idx:
        keep[max(0, i - LEAD): min(n, i + SETTLE + 1)] = True
    # Squeeze long still gaps: keep only their first IDLE_KEEP frames.
    i = 0
    while i < n:
        if not keep[i]:
            j = i
            while j < n and not keep[j]:
                j += 1
            keep[i: min(j, i + IDLE_KEEP)] = True
            i = j
        else:
            i += 1
    return keep


def first_motion(d, t0):
    """First frame at/after t0 (seconds) where the screen starts changing."""
    f = int(max(0, t0) * FPS)
    for i in range(f, min(len(d), f + 4 * FPS)):
        if d[i] > THRESH:
            return i
    return f


def ranges(mask):
    out, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            out.append((i, j - 1))
            i = j
        else:
            i += 1
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    taps_out = {}
    for name, cfg in CLIPS.items():
        src = os.path.join(RAW, f'{name}.mp4')
        log = [l.split() for l in open(os.path.join(RAW, f'{name}.log')) if l.strip()]
        start = float(log[0][1])
        marks = [(l[0], float(l[1]) - start, float(l[2]), float(l[3])) for l in log[1:]]
        d = motion(src)
        keep = keep_frames(d)
        # Every logged action keeps its reaction and a breath before it.
        react = {}
        for label, t, x, y in marks:
            r = first_motion(d, t)
            react[label] = r
            keep[max(0, r - 12): r + 1] = True
        out_index = np.cumsum(keep) - 1                   # source frame -> output frame
        rs = ranges(keep)
        sel = '+'.join(f'between(n,{a},{b})' for a, b in rs)

        # Name blurs, timed in source seconds.
        chain, last = [], '[0:v]'
        chain.append(f'{last}fps={FPS}[v0]'); last = '[v0]'
        for k, (tag, (x, y, w, h), when) in enumerate(cfg.get('blur', [])):
            kind, ref = when.split(':')
            t_ref = react[ref] / FPS + 0.35
            enable = f'lt(t,{t_ref:.2f})' if kind == 'until' else f'gte(t,{t_ref - 0.2:.2f})'
            chain.append(f'{last}split[b{k}a][b{k}b];[b{k}b]crop={w}:{h}:{x}:{y},boxblur=lr=14:lp=3:cr=7:cp=3[b{k}c];'
                         f"[b{k}a][b{k}c]overlay={x}:{y}:enable='{enable}'[v{k + 1}]")
            last = f'[v{k + 1}]'
        chain.append(f"{last}select='{sel}',setpts=N/{FPS}/TB,scale={OUT_W}:{OUT_H}:flags=lanczos,"
                     f'tpad=stop_mode=clone:stop_duration=1.2,format=yuv420p[out]')
        mp4 = os.path.join(OUT, f'{name}.mp4')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-filter_complex', ';'.join(chain),
                        '-map', '[out]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
                        '-profile:v', 'high', '-r', str(FPS), '-movflags', '+faststart', '-an', mp4], check=True)
        for which, flt in (('first', 'select=eq(n\\,0)'), ('last', 'reverse')):
            png = os.path.join(OUT, f'.{name}-{which}.png')
            pre = ['-sseof', '-0.2'] if which == 'last' else []
            subprocess.run(['ffmpeg', '-v', 'error', '-y', *pre, '-i', mp4, '-frames:v', '1', png], check=True)
        subprocess.run(['python3', '-I', '-c',
                        'import sys;from PIL import Image\n'
                        'for p,o in zip(sys.argv[1::2],sys.argv[2::2]):\n'
                        ' Image.open(p).convert("RGB").save(o,quality=88,method=6)',
                        os.path.join(OUT, f'.{name}-first.png'), os.path.join(OUT, f'{name}.webp'),
                        os.path.join(OUT, f'.{name}-last.png'), os.path.join(OUT, f'{name}-end.webp')], check=True)
        for which in ('first', 'last'):
            os.remove(os.path.join(OUT, f'.{name}-{which}.png'))

        taps = []
        for label, t, x, y in marks:
            r = react[label]
            entry = {'t': round(max(0, out_index[r] / FPS - 0.06), 2), 'x': round(x / 402, 4), 'y': round(y / 874, 4)}
            if label in cfg.get('swipes', {}):
                x2, y2, dur = cfg['swipes'][label]
                entry.update({'x2': round(x2 / 402, 4), 'y2': round(y2 / 874, 4), 'd': dur})
            taps.append(entry)
        taps_out[name] = taps
        dur = (keep.sum() / FPS) + 1.2
        print(f'{name:12s} {len(d) / FPS:5.1f}s -> {dur:4.1f}s  taps {[(e["t"]) for e in taps]}')
    json.dump(taps_out, open(os.path.join(OUT, 'taps.json'), 'w'), indent=1)


main()
