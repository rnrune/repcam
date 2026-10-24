#!/usr/bin/env bash
# Download feedback clips + labels from Dropbox (via the worker's admin endpoints) into $FB_DIR (default /workspace/repcam-feedback-clips),
# verify each file (size + Dropbox content_hash), then DELETE it from Dropbox (free plan, 2 GB) — only after the local copy is verified.
# Builds eval manifest entries (./manifest.json). Secret: /workspace/.secrets/newrun-feedback-admin (never printed).
# Usage: eval/feedback/pull.sh [--keep]   (--keep: don't delete from Dropbox)   env: FB_URL, FB_SECRET_FILE, FB_DIR
set -euo pipefail
cd "$(dirname "$0")"
FB_URL="${FB_URL:-https://repcam-strava.repcam.workers.dev}"
SECRET_FILE="${FB_SECRET_FILE:-/workspace/.secrets/newrun-feedback-admin}"
FB_DIR="${FB_DIR:-/workspace/repcam-feedback-clips}"
KEEP=0; [ "${1:-}" = "--keep" ] && KEEP=1
[ -r "$SECRET_FILE" ] || { echo "missing $SECRET_FILE" >&2; exit 1; }
AUTH="Authorization: Bearer $(cat "$SECRET_FILE")"
mkdir -p "$FB_DIR"
api() { curl -fsS --retry 3 -H @<(printf '%s\n' "$AUTH") "$@"; }
enc() { node -e 'console.log(encodeURIComponent(process.argv[1]))' "$1"; }
cursor=""; keys=$(mktemp); cf=$(mktemp); trap 'rm -f "$keys" "$cf"' EXIT
while :; do
  r=$(api "$FB_URL/fb/admin/list?prefix=clips/${cursor:+&cursor=$(enc "$cursor")}")
  echo "$r" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);for(const o of j.objects)console.log(o.key+"\t"+o.size+"\t"+(o.content_hash||""));require("fs").writeFileSync(process.argv[1],j.cursor||"")})' "$cf" >> "$keys"
  cursor=$(cat "$cf"); [ -n "$cursor" ] || break
done
got=0; del=0; bad=0
while IFS=$'\t' read -r key size hash; do
  [[ "$key" =~ ^clips/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+$ ]] || { echo "skip odd key $key" >&2; continue; }
  f="$FB_DIR/${key#clips/}"; mkdir -p "$(dirname "$f")"
  api -o "$f.part" "$FB_URL/fb/admin/get?key=$(enc "$key")" || { echo "download failed: $key" >&2; rm -f "$f.part"; bad=$((bad+1)); continue; }
  lsize=$(stat -c %s "$f.part"); lhash=$(node dbx-hash.js "$f.part")
  if [ "$lsize" != "$size" ] || [ -z "$hash" ] || [ "$lhash" != "$hash" ]; then
    echo "VERIFY FAILED (kept in Dropbox): $key size $lsize/$size" >&2; rm -f "$f.part"; bad=$((bad+1)); continue
  fi
  mv "$f.part" "$f"; got=$((got+1))
  if [ $KEEP = 0 ]; then api -X POST "$FB_URL/fb/admin/delete?key=$(enc "$key")" > /dev/null && del=$((del+1)) || echo "delete failed: $key" >&2; fi
done < "$keys"
node to-manifest.js "$FB_DIR" manifest.json
echo "pulled+verified $got file(s), deleted $del from Dropbox, $bad failed; $(wc -l < "$keys") listed"
[ $bad = 0 ]
