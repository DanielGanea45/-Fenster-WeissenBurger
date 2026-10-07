#!/usr/bin/env bash
# Komprimiert die Originalvideos/-bilder aus dem Design-Ordner nach assets/.
# Aufruf: bash scripts/compress-media.sh "<Quellordner>"   (ein Video nach dem anderen)
set -euo pipefail
SRC="${1:-firma ferestre}"
FF="${FFMPEG:-ffmpeg}"
cd "$(dirname "$0")/.."

# Szene -> Quelldatei
declare -A SCENES=(
  [home]=b8955qqb0wcuyz0qppbj
  [produkte]=i5fojjpar6oynzjpfgiw
  [leistungen]=c85cj3wqrrfnfoqaft9y
  [ueber-uns]=lkgok2adl19rkv5jti7k
  [kontakt]=jsz0ciqsqe0g6mgk9fpd
)
# Produkt -> Quellbild
declare -A PRODUCTS=(
  [kunststofffenster]=m9ixkz8rl21buwkmmskb
  [aluminiumfenster]=by3p1femv01lpzwlrqhp
  [holzfenster]=fggabatetawgdkqqwifs
  [haustuer]=x62bjygb1hjpqfiyzmo6
)

for scene in home produkte leistungen ueber-uns kontakt; do
  in="$SRC/${SCENES[$scene]}.mp4"
  echo "== $scene  <- $in"
  "$FF" -v error -y -i "$in" -an -vf "scale=720:1280:flags=lanczos,fps=24" \
    -c:v libx264 -profile:v high -level 4.0 -preset slow -crf 28 -pix_fmt yuv420p \
    -movflags +faststart "assets/video/$scene.mp4"
  "$FF" -v error -y -i "$in" -an -vf "scale=720:1280:flags=lanczos,fps=24" \
    -c:v libvpx-vp9 -b:v 0 -crf 42 -row-mt 1 -deadline good -cpu-used 2 \
    "assets/video/$scene.webm"
  "$FF" -v error -y -i "$in" -frames:v 1 -vf "scale=720:1280:flags=lanczos" \
    -c:v libwebp -quality 72 "assets/video/$scene-poster.webp"
  ls -la assets/video/$scene*
done

for p in "${!PRODUCTS[@]}"; do
  in="$SRC/${PRODUCTS[$p]}.png"
  echo "== $p <- $in"
  "$FF" -v error -y -i "$in" -vf "scale=928:-1:flags=lanczos" -c:v libwebp -quality 80 "assets/img/$p-928.webp"
  "$FF" -v error -y -i "$in" -vf "scale=464:-1:flags=lanczos" -c:v libwebp -quality 80 "assets/img/$p-464.webp"
done
ls -la assets/img
