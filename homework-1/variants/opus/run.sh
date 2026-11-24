#!/usr/bin/env bash
# Starts the API and the web UI in the foreground. Ctrl+C stops both.
set -euo pipefail
cd "$(dirname "$0")"

export API_PORT="${API_PORT:-3002}"
export UI_PORT="${UI_PORT:-5102}"
export API_BASE_URL="${API_BASE_URL:-http://localhost:$API_PORT}"

# No npm dependencies: only Node.js >= 18 is needed.
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js >= 18 is required (https://nodejs.org)." >&2
  exit 1
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "Node.js >= 18 is required, found $(node -v)." >&2
  exit 1
fi

node api/server.js &
API_PID=$!
node ui/server.js &
UI_PID=$!

trap 'kill $API_PID $UI_PID 2>/dev/null || true' INT TERM EXIT
# Plain `wait` (not `wait -n`) so this also works on macOS's bash 3.2.
wait
