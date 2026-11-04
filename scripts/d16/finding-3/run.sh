#!/usr/bin/env bash
# D16 finding 3 investigation: sign-in failure timing of allowlisted, account and unknown addresses,
# without and with added database latency (one process, no CPU saturation; NOT a D16 run).
# Scratch only: a LOCAL MariaDB database whose name ends in _test (the integration globalSetup
# EMPTIES and migrates it). Results: docs/reports/d16-timing/finding-3-allowlist-timing.md.
#
#   F3_DB_URL='mysql://<user>:<pass>@127.0.0.1:3306/f3_test' scripts/d16/finding-3/run.sh [delayMs=50] [rounds=40]
#
# To check a candidate fix, apply it to src/ in a scratch copy and run this script there.
set -euo pipefail
cd "$(dirname "$0")/../../.."

: "${F3_DB_URL:?F3_DB_URL (a local *_test database) is required}"
DELAY="${1:-50}"
ROUNDS="${2:-40}"
PROXY_PORT="${F3_PROXY_PORT:-3307}"
OUT="${F3_OUT_DIR:-$(mktemp -d)}"
mkdir -p "$OUT"
read -r DB_HOST DB_PORT DB_NAME PROXY_URL < <(node -e '
  const u = new URL(process.argv[1]); const p = new URL(process.argv[1]); p.port = process.argv[2];
  console.log(u.hostname, u.port || "3306", u.pathname.slice(1), p.toString());' "$F3_DB_URL" "$PROXY_PORT")
case "$DB_HOST" in 127.0.0.1|localhost) ;; *) echo "finding-3: the database must be on loopback" >&2; exit 1 ;; esac
case "$DB_NAME" in *_test) ;; *) echo "finding-3: the database name must end in _test (it is emptied)" >&2; exit 1 ;; esac

node scripts/d16/finding-3/latency-proxy.mjs "$PROXY_PORT" "$DB_PORT" "$DELAY" & PROXY=$!
trap 'kill "$PROXY" 2>/dev/null || true' EXIT
sleep 1

probe() { # <label> <database url>
  F3_N="$ROUNDS" F3_OUT="$OUT/$1.csv" TEST_DATABASE_URL="$2" \
    npx vitest run --config scripts/d16/finding-3/vitest.config.ts >"$OUT/$1.log" 2>&1 || { tail -30 "$OUT/$1.log" >&2; exit 1; }
  node scripts/d16/finding-3/summarize.mjs "$OUT/$1.csv" "$1"
}
probe "no-added-latency" "$F3_DB_URL"
probe "plus-${DELAY}ms-per-round-trip" "$PROXY_URL"
echo "raw CSV and logs: $OUT"
