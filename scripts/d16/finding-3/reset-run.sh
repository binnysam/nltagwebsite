#!/usr/bin/env bash
# Password-reset REQUEST timing by address shape (security-readiness review 5 Nov 2026, item 4):
# one process, no CPU saturation, through a latency proxy that adds a fixed delay to every database
# response. Scratch only: a LOCAL MariaDB database whose name ends in _test (the integration
# globalSetup EMPTIES and migrates it).
#
#   F3_DB_URL='mysql://<user>:<pass>@127.0.0.1:3306/rt_test' scripts/d16/finding-3/reset-run.sh [rounds=40] [delays="0 20 30 50"]
set -euo pipefail
cd "$(dirname "$0")/../../.."

: "${F3_DB_URL:?F3_DB_URL (a local *_test database) is required}"
ROUNDS="${1:-40}"
DELAYS="${2:-0 20 30 50}"
PROXY_PORT="${F3_PROXY_PORT:-3309}"
OUT="${F3_OUT_DIR:-$(mktemp -d)}"
mkdir -p "$OUT"
read -r DB_HOST DB_PORT DB_NAME PROXY_URL < <(node -e '
  const u = new URL(process.argv[1]); const p = new URL(process.argv[1]); p.port = process.argv[2];
  console.log(u.hostname, u.port || "3306", u.pathname.slice(1), p.toString());' "$F3_DB_URL" "$PROXY_PORT")
case "$DB_HOST" in 127.0.0.1|localhost) ;; *) echo "reset-run: the database must be on loopback" >&2; exit 1 ;; esac
case "$DB_NAME" in *_test) ;; *) echo "reset-run: the database name must end in _test (it is emptied)" >&2; exit 1 ;; esac

for d in $DELAYS; do
  url="$F3_DB_URL"; PROXY=""
  if [ "$d" != "0" ]; then
    node scripts/d16/finding-3/latency-proxy.mjs "$PROXY_PORT" "$DB_PORT" "$d" >/dev/null & PROXY=$!
    sleep 1; url="$PROXY_URL"
  fi
  label="plus-${d}ms-per-round-trip"
  F3_N="$ROUNDS" F3_OUT="$OUT/$label.csv" TEST_DATABASE_URL="$url" \
    npx vitest run --config scripts/d16/finding-3/reset.vitest.config.ts >"$OUT/$label.log" 2>&1 || { tail -30 "$OUT/$label.log" >&2; [ -n "$PROXY" ] && kill "$PROXY"; exit 1; }
  [ -n "$PROXY" ] && { kill "$PROXY"; wait "$PROXY" 2>/dev/null || true; }
  node scripts/d16/finding-3/reset-summarize.mjs "$OUT/$label.csv" "$label"
done
echo "raw CSV and logs: $OUT"
