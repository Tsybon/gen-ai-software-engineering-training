#!/usr/bin/env bash
# Starts the Synergy banking API and web UI in the foreground. Ctrl-C stops both.
set -uo pipefail
cd "$(dirname "$0")"

API_PORT="${API_PORT:-3003}"
UI_PORT="${UI_PORT:-5103}"
export API_PORT UI_PORT
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:${API_PORT}}"
READY_TIMEOUT_S=30

die() { echo "run.sh: $*" >&2; exit 1; }

for p in "$API_PORT" "$UI_PORT"; do
  [[ "$p" =~ ^[0-9]+$ ]] && (( p >= 1 && p <= 65535 )) || die "invalid port '$p'"
done
[[ "$API_PORT" != "$UI_PORT" ]] || die "API_PORT and UI_PORT must differ"
command -v node >/dev/null || die "Node.js >= 20 is required"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 20 )) || die "Node.js >= 20 is required (found $(node -v))"

port_busy() { (echo >"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }
for p in "$API_PORT" "$UI_PORT"; do
  port_busy "$p" && die "port $p is already in use (not killing the other process)"
done

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${PIDS[@]:-}"; do [[ -n "$pid" ]] && kill "$pid" 2>/dev/null; done
  wait 2>/dev/null
}
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

install_if_missing() {
  if [[ ! -d "$1/node_modules" ]]; then
    echo "Installing dependencies in $1/ …"
    (cd "$1" && npm install --no-audit --no-fund) || die "npm install failed in $1/"
  fi
}
install_if_missing api
install_if_missing ui

echo "Building UI (API base: $VITE_API_BASE_URL) …"
(cd ui && npm run build --silent) || die "UI build failed"

(cd api && exec node src/server.js) &
PIDS+=($!)
(cd ui && exec npx vite preview --host 0.0.0.0 --port "$UI_PORT" --strictPort) &
PIDS+=($!)

wait_for() {
  local url="$1" i
  for ((i = 0; i < READY_TIMEOUT_S * 2; i++)); do
    curl -fsS -o /dev/null "$url" 2>/dev/null && return 0
    sleep 0.5
  done
  return 1
}
wait_for "http://localhost:${API_PORT}/health" || die "API did not become ready on port $API_PORT"
wait_for "http://localhost:${UI_PORT}/" || die "UI did not become ready on port $UI_PORT"

echo ""
echo "  API → http://localhost:${API_PORT}"
echo "  UI  → http://localhost:${UI_PORT}"
echo "  Ctrl-C to stop"

# Portable supervision (macOS bash 3.2 lacks `wait -n`): stop everything if either child exits.
while true; do
  for pid in "${PIDS[@]}"; do
    kill -0 "$pid" 2>/dev/null || { echo "run.sh: a service exited; stopping" >&2; exit 1; }
  done
  sleep 1
done
