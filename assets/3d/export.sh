#!/usr/bin/env bash
# Package Blender renders (build_scene.py --anim) for the website.
#
#   export.sh features <variant> <main_dir> <shadow_dir> <out_dir>
#       → clip-1.mp4 … clip-5.mp4 (pose k → k+1), clip-N-r.mp4 (played for "back"),
#         pose-1.webp … pose-6.webp (stills shown at rest and for jumps)
#   export.sh morph <variant> <main_dir> <out_dir>
#       → 001.webp … (scroll-scrubbed frame sequence)
#
# Every frame is flattened onto the site's card colour (--paper) with the floor-shadow
# pass underneath the phones.
set -euo pipefail
BG=0xF7F7F4; FPS=30; SEG=40
KIND=${1:?features|morph}; VARIANT=${2:?variant}
size() { ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$1"; }
# This ffmpeg has no WebP encoder, so stills go through Pillow (PNG in, WebP out, PNG removed).
towebp() { q=$1; shift; python3 -I -c 'import sys,os
from PIL import Image
q=int(sys.argv[1])
for p in sys.argv[2:]:
    Image.open(p).convert("RGB").save(p[:-4]+".webp", quality=q, method=6); os.remove(p)' "$q" "$@"; }
COLOR=(-colorspace bt709 -color_primaries bt709 -color_trc bt709)

if [ "$KIND" = features ]; then
  MAIN=${3:?}; SHADOW=${4:?}; OUT=${5:?}; mkdir -p "$OUT"
  SZ=$(size "$MAIN/f_0001.png")
  N=$(ls "$MAIN"/f_*.png | wc -l | tr -d ' ')
  POSES=$(( (N - 1) / SEG + 1 ))
  flat="[2][0]overlay=format=auto:shortest=1[s];[s][1]overlay=format=auto"
  for k in $(seq 1 "$POSES"); do
    f=$(( 1 + SEG * (k - 1) ))
    ffmpeg -v error -y -start_number $f -i "$MAIN/f_%04d.png" -start_number $f -i "$SHADOW/f_%04d.png" \
      -f lavfi -i "color=c=$BG:s=$SZ" -filter_complex "$flat" -frames:v 1 "$OUT/pose-$k.png"
    towebp 86 "$OUT/pose-$k.png"
  done
  for k in $(seq 1 $(( POSES - 1 ))); do
    s=$(( 1 + SEG * (k - 1) ))
    enc=(-c:v libx264 -crf 19 -preset slow -pix_fmt yuv420p "${COLOR[@]}" -movflags +faststart -an)
    ffmpeg -v error -y -framerate $FPS -start_number $s -i "$MAIN/f_%04d.png" \
      -framerate $FPS -start_number $s -i "$SHADOW/f_%04d.png" -f lavfi -i "color=c=$BG:s=$SZ:r=$FPS" \
      -filter_complex "$flat,trim=end_frame=$(( SEG + 1 ))" "${enc[@]}" "$OUT/clip-$k.mp4"
    ffmpeg -v error -y -i "$OUT/clip-$k.mp4" -vf reverse "${enc[@]}" "$OUT/clip-$k-r.mp4"
  done
  echo "$VARIANT: $(ls "$OUT" | wc -l | tr -d ' ') files, $(du -sh "$OUT" | cut -f1)"
else
  MAIN=${3:?}; OUT=${4:?}; mkdir -p "$OUT"
  SZ=$(size "$MAIN/f_0001.png")
  ffmpeg -v error -y -i "$MAIN/f_%04d.png" -f lavfi -i "color=c=$BG:s=$SZ" \
    -filter_complex "[1][0]overlay=format=auto:shortest=1" "$OUT/%03d.png"
  towebp 80 "$OUT"/*.png
  echo "$VARIANT: $(ls "$OUT" | wc -l | tr -d ' ') frames, $(du -sh "$OUT" | cut -f1)"
fi
