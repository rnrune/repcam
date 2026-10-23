#!/bin/bash
# dl.sh <cat> <pexelsid> : stream first 60s, convert to 480px 15fps h264
c=$1; id=$2; out=videos/px$id.mp4; [ -s $out ] && exit 0
url=$(curl -sI -A 'Mozilla/5.0' https://www.pexels.com/download/video/$id/ | awk 'tolower($1)=="location:"{print $2}' | tr -d '\r')
[ -z "$url" ] && { echo "nourl $id"; exit 0; }
echo "$c px$id $url" >> sources_raw.txt
ffmpeg -v error -y -t 60 -i "$url" -vf "fps=15,scale='if(gt(iw,ih),480,-2)':'if(gt(iw,ih),-2,480)'" -c:v libx264 -crf 26 -an -pix_fmt yuv420p $out && echo ok $id
