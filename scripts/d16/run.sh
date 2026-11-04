#!/usr/bin/env bash
# D16 two-process timing harness — ONE independent run. Scratch only: a loopback server built from
# this checkout, a scratch MariaDB, a local SMTP sink, fictional @nltag.test accounts. Never the
# production database, production SMTP, the Hostinger environment or the public domain.
# Procedure, criteria and how to reproduce: scripts/d16/README.md.
#
#   D16_DB_URL=mysql://<user>:<pass>@127.0.0.1:3306/nltag_d16 scripts/d16/run.sh run-1
#
# Optional: D16_PORT (3200) D16_SMTP_PORT (2525) D16_CONNECTIONS (256) D16_N (200) D16_RAMP_S (10)
#           D16_P1_CPUS (0-1) D16_P2_CPUS (2-3) D16_P3_CPUS (3) D16_STRESS (0 = none; k = k busy
#           loops pinned to P1's cores) D16_OUT_ROOT (docs/reports/d16-timing)
set -euo pipefail
cd "$(dirname "$0")/../.."

RUN_ID="${1:?usage: scripts/d16/run.sh <run-id>}"
: "${D16_DB_URL:?D16_DB_URL (the scratch database) is required}"
DB_HOST="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$D16_DB_URL")"
DB_NAME="$(node -e 'console.log(new URL(process.argv[1]).pathname.slice(1))' "$D16_DB_URL")"
case "$DB_HOST" in 127.0.0.1|localhost) ;; *) echo "D16: scratch database must be on loopback" >&2; exit 1 ;; esac
case "$DB_NAME" in *d16*) ;; *) echo "D16: scratch database name must contain d16" >&2; exit 1 ;; esac
[ -f .next/BUILD_ID ] || { echo "D16: build first (npm run build)" >&2; exit 1; }

PORT="${D16_PORT:-3200}"; SMTP_PORT="${D16_SMTP_PORT:-2525}"; CONN="${D16_CONNECTIONS:-256}"; N="${D16_N:-200}"
RAMP="${D16_RAMP_S:-10}"; P1_CPUS="${D16_P1_CPUS:-0-1}"; P2_CPUS="${D16_P2_CPUS:-2-3}"; P3_CPUS="${D16_P3_CPUS:-3}"
STRESS="${D16_STRESS:-0}"; OUT="${D16_OUT_ROOT:-docs/reports/d16-timing}/$RUN_ID"
mkdir -p "$OUT"
SECRET="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')-harness-only"
LISTED="d16-listed-0@nltag.test,d16-listed-1@nltag.test"
now_ms() { node -e 'console.log(Date.now())'; }

echo "D16 $RUN_ID: migrate + accounts (scratch $DB_NAME)"
DATABASE_URL="$D16_DB_URL" BETTER_AUTH_SECRET="$SECRET" BETTER_AUTH_URL="http://127.0.0.1:$PORT" npm run -s db:migrate >/dev/null
KNOWN="$(D16_DB_URL="$D16_DB_URL" node scripts/d16/seed-accounts.mjs 10)"
mysql_clear() { node -e '
  const m = require("mysql2/promise");
  (async () => { const c = await m.createConnection({ uri: process.argv[1] });
    await c.query("DELETE FROM rate_limit_bucket"); await c.query("DELETE FROM rate_limit"); await c.end(); })();' "$D16_DB_URL"; }
mysql_clear  # fresh buckets for every run

PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; wait 2>/dev/null || true; }
trap cleanup EXIT

node scripts/d16/smtp-sink.mjs "$SMTP_PORT" "$OUT/smtp.json" & PIDS+=($!)

echo "D16 $RUN_ID: P1 next start on 127.0.0.1:$PORT (cpus $P1_CPUS)"
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
  BETTER_AUTH_URL="http://127.0.0.1:$PORT" BETTER_AUTH_SECRET="$SECRET" DATABASE_URL="$D16_DB_URL" \
  NLTAG_ACCOUNTS_ENABLED=1 AUTH_RATE_LIMIT=on NLTAG_SIGNUP_ALLOWLIST="$LISTED" \
  SMTP_HOST=127.0.0.1 SMTP_PORT="$SMTP_PORT" SMTP_USER=harness SMTP_PASS=harness SMTP_FROM="D16 <d16@nltag.test>" \
  taskset -c "$P1_CPUS" node node_modules/next/dist/bin/next start -p "$PORT" -H 127.0.0.1 > "$OUT/.p1.log" 2>&1 & P1=$!; PIDS+=($P1)
for _ in $(seq 1 120); do curl -sf -o /dev/null "http://127.0.0.1:$PORT/en" && break; sleep 0.5; done
curl -sf -o /dev/null "http://127.0.0.1:$PORT/en" || { echo "D16: P1 did not start" >&2; tail -20 "$OUT/.p1.log" >&2; exit 1; }
# Warm-up (not recorded): compile routes, fill pools.
for i in $(seq 1 20); do curl -s -o /dev/null -X POST -H 'content-type: application/json' -H "origin: http://127.0.0.1:$PORT" \
  --data "{\"email\":\"d16-warm-$i@nltag.test\",\"password\":\"d16-warm-wrong\"}" "http://127.0.0.1:$PORT/api/auth/sign-in/email"; done
mysql_clear

CPU_T0="$(now_ms)"
node scripts/d16/cpu.mjs "$P1" "$OUT/cpu.csv" & PIDS+=($!)
for i in $(seq 1 "$STRESS"); do taskset -c "$P1_CPUS" node -e 'for(;;){}' & PIDS+=($!); done
echo "D16 $RUN_ID: P2 load ($CONN connections, cpus $P2_CPUS), ramp ${RAMP}s"
taskset -c "$P2_CPUS" node scripts/d16/load.mjs "http://127.0.0.1:$PORT" "$CONN" "$OUT/load.json" & P2=$!; PIDS+=($P2)
sleep "$RAMP"

echo "D16 $RUN_ID: P3 probes (N=$N per class, cpus $P3_CPUS)"
PROBE_START="$(now_ms)"
set +e
D16_BASE="http://127.0.0.1:$PORT" D16_DB_URL="$D16_DB_URL" D16_SECRET="$SECRET" D16_KNOWN="$KNOWN" D16_LISTED="$LISTED" \
  D16_N="$N" D16_OUT="$OUT/probes.csv" taskset -c "$P3_CPUS" node scripts/d16/probe.mjs
PROBE_EXIT=$?
set -e
PROBE_END="$(now_ms)"
kill -TERM "$P2"; wait "$P2" 2>/dev/null || true

FLOOR_LINES="$(grep -c 'security.timing_floor_exceeded' "$OUT/.p1.log" || true)"
DBV="$(node -e '
  const m = require("mysql2/promise");
  (async () => { const c = await m.createConnection({ uri: process.argv[1] }); const [r] = await c.query("SELECT VERSION() v"); console.log(r[0].v); await c.end(); })();' "$D16_DB_URL")"
cat > "$OUT/meta.json" <<JSON
{
  "runId": "$RUN_ID",
  "commit": "$(git rev-parse HEAD)",
  "recordedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "database": "$DB_NAME (MariaDB $DBV, scratch)",
  "node": "$(node -v)",
  "cpu": "$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs) x $(nproc)",
  "p1Cpus": "$P1_CPUS", "p2Cpus": "$P2_CPUS", "p3Cpus": "$P3_CPUS", "stressLoops": $STRESS,
  "connections": $CONN, "probesPerClass": $N, "rampSeconds": $RAMP,
  "probeStartOffsetMs": $((PROBE_START - CPU_T0)), "probeEndOffsetMs": $((PROBE_END - CPU_T0)),
  "probeExit": $PROBE_EXIT, "timingFloorExceededLogLines": $FLOOR_LINES
}
JSON
cleanup; trap - EXIT
node scripts/d16/analyze.mjs "$OUT"
