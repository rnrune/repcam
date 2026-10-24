#!/usr/bin/env bash
# Download new feedback clips + labels from the private R2 bucket (via the worker's admin endpoint) into ./clips
# and convert them into eval manifest entries (./manifest.json). Secret: /workspace/.secrets/newrun-feedback-admin (never printed).
# Usage: eval/feedback/pull.sh [--all]   env: FB_URL (default deployed worker), FB_SECRET_FILE
set -euo pipefail
cd "$(dirname "$0")"
FB_URL="${FB_URL:-https://repcam-strava.repcam.workers.dev}"
SECRET_FILE="${FB_SECRET_FILE:-/workspace/.secrets/newrun-feedback-admin}"
[ -r "$SECRET_FILE" ] || { echo "missing $SECRET_FILE" >&2; exit 1; }
AUTH="Authorization: Bearer $(cat "$SECRET_FILE")"
mkdir -p clips
api() { curl -fsS --retry 3 -H @<(printf '%s\n' "$AUTH") "$@"; }
cursor=""; keys=$(mktemp); trap 'rm -f "$keys"' EXIT
while :; do
  r=$(api "$FB_URL/fb/admin/list?prefix=clips/${cursor:+&cursor=$cursor}")
  echo "$r" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);for(const o of j.objects)console.log(o.key+"\t"+o.size);console.error(j.cursor||"")})' >> "$keys" 2> /tmp/fbcursor.$$
  cursor=$(cat /tmp/fbcursor.$$); rm -f /tmp/fbcursor.$$; [ -n "$cursor" ] || break
done
new=0
while IFS=$'\t' read -r key size; do
  f="clips/${key#clips/}"; mkdir -p "$(dirname "$f")"
  # labels can change after upload: always refresh JSON; videos only when missing/size differs
  if [[ "$key" == *.json ]] || [ ! -f "$f" ] || [ "$(stat -c %s "$f")" != "$size" ] || [ "${1:-}" = "--all" ]; then
    api -o "$f.part" "$FB_URL/fb/admin/get?key=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$key")" && mv "$f.part" "$f"
    [[ "$key" == *.json ]] || new=$((new+1))
  fi
done < "$keys"
node to-manifest.js clips manifest.json
echo "pulled $new new video(s); $(wc -l < "$keys") objects total"
