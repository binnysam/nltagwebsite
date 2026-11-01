#!/usr/bin/env bash
# Builds with the private gallery enabled and serves on :3100 for browser tests.
# Never use this build for production.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .gallery-server.pid ] && kill "$(cat .gallery-server.pid)" 2>/dev/null || true
# Stop anything else still bound to :3100 (a stale server would serve old chunks).
command -v fuser >/dev/null && fuser -k 3100/tcp 2>/dev/null || true
sleep 1
NLTAG_DESIGN_SYSTEM_GALLERY=1 npx next build > /tmp/nltag-build.log 2>&1
nohup npx next start -p 3100 > /tmp/nltag-server.log 2>&1 &
echo $! > .gallery-server.pid
for _ in $(seq 1 30); do curl -sf -o /dev/null http://localhost:3100/ta && exit 0; sleep 1; done
echo "server did not start" >&2; exit 1
