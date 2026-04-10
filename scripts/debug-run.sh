#!/bin/sh
# Minimal POSIX shell wrapper (busybox-friendly)
# Runs the app with extra Node diagnostics and captures logs + exit status.

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
LOG_DIR="${VPOS_LOG_DIR:-$ROOT_DIR/logs}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/vpos-$TS.log"
HB_FILE="${VPOS_HEARTBEAT_FILE:-$LOG_DIR/vpos-$TS.heartbeat.json}"
FIFO="$LOG_DIR/.vpos-$TS.fifo"

rm -f "$FIFO"
mkfifo "$FIFO"

# Node flags chosen to make crashes non-silent.
NODE_FLAGS="--trace-uncaught --trace-warnings --unhandled-rejections=strict"

# Enable verbose env dump (redacted).
export VPOS_DUMP_ENV="${VPOS_DUMP_ENV:-1}"
export VPOS_HEARTBEAT_FILE="$HB_FILE"

{
  echo "[debug-run] root=$ROOT_DIR"
  echo "[debug-run] log=$LOG_FILE"
  echo "[debug-run] heartbeat=$HB_FILE"
  echo "[debug-run] starting: node $NODE_FLAGS start.cjs"
} | tee -a "$LOG_FILE"

# Stream FIFO to console + log
(tail -f "$FIFO" | tee -a "$LOG_FILE") &
TAILPID=$!

# Run node, writing to FIFO
(
  cd "$ROOT_DIR"
  node $NODE_FLAGS start.cjs >"$FIFO" 2>&1
)
STATUS=$?

# Stop tail/tee and cleanup
kill "$TAILPID" 2>/dev/null || true
rm -f "$FIFO"

echo "[debug-run] exited status=$STATUS" | tee -a "$LOG_FILE"
exit $STATUS
