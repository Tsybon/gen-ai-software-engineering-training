#!/usr/bin/env bash
# Starts all three AI-built banking apps and the AI Engineering Observatory. Ctrl-C stops everything.
#   Observatory  http://localhost:5100
#   Codex        API :3001  UI :5101
#   Opus         API :3002  UI :5102
#   Synergy      API :3003  UI :5103
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
READY_TIMEOUT_S=180
PORTS=(3001 3002 3003 5100 5101 5102 5103)
LOG_DIR="$ROOT/demo/.logs"

die() { echo "demo/run.sh: $*" >&2; exit 1; }
command -v node >/dev/null || die "Node.js >= 20 is required"
for p in "${PORTS[@]}"; do
  (echo >"/dev/tcp/127.0.0.1/$p") >/dev/null 2>&1 && die "port $p is busy — stop whatever uses it and retry"
done
mkdir -p "$LOG_DIR"

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${PIDS[@]:-}"; do [[ -n "$pid" ]] && kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null; done
  wait 2>/dev/null
}
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

start() { # name, api port, ui port
  echo "Starting $1 (API :$2, UI :$3) — log: demo/.logs/$1.log"
  set -m
  (API_PORT="$2" UI_PORT="$3" exec "$ROOT/variants/$1/run.sh") >"$LOG_DIR/$1.log" 2>&1 &
  PIDS+=($!)
  set +m
}
start codex 3001 5101
start opus 3002 5102
start synergy 3003 5103

if [[ ! -f "$ROOT/observatory/public/metrics.json" ]]; then
  echo "metrics.json missing — building it from logs"
  (cd "$ROOT/benchmark" && python3 -m collector.build) || die "collector failed"
fi
echo "Building Observatory"
(cd "$ROOT/observatory" && { [[ -d node_modules ]] || npm install --no-audit --no-fund; } && npm run build --silent) >"$LOG_DIR/observatory-build.log" 2>&1 \
  || die "Observatory build failed — see demo/.logs/observatory-build.log"
set -m
(cd "$ROOT/observatory" && exec npx vite preview --port 5100 --strictPort) >"$LOG_DIR/observatory.log" 2>&1 &
PIDS+=($!)
set +m

wait_for() {
  local i
  for ((i = 0; i < READY_TIMEOUT_S; i++)); do curl -fs -o /dev/null "$1" && return 0; sleep 1; done
  return 1
}
for url in http://localhost:5100/ http://localhost:5101/ http://localhost:5102/ http://localhost:5103/; do
  wait_for "$url" && echo "  ready  $url" || echo "  NOT READY  $url (see demo/.logs/)"
done
echo ""
echo "Open http://localhost:5100 — Ctrl-C to stop everything."
while true; do sleep 5; done
