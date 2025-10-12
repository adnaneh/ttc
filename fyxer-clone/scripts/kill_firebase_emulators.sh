#!/usr/bin/env bash
set -euo pipefail

# Kill processes bound to common Firebase emulator ports (defaults + fallbacks used earlier)
PORTS=(
  5001 5003       # functions
  8080 8081       # firestore
  8085 8086       # pubsub
  9199 9198       # storage
  4000 4001 4003  # ui
  4400 4401 4402  # hub
  4500 4501 4502  # logging
  9150 9151       # firestore UI websocket
  9299 9300       # eventarc
  9499 9500       # cloud tasks
)

kill_port() {
  local port=$1
  if pids=$(lsof -ti tcp:"$port" 2>/dev/null) && [[ -n "$pids" ]]; then
    echo "Killing processes on port $port: $pids"
    kill -TERM $pids 2>/dev/null || true
    sleep 0.3
    if pids2=$(lsof -ti tcp:"$port" 2>/dev/null) && [[ -n "$pids2" ]]; then
      echo "Force killing processes on port $port: $pids2"
      kill -KILL $pids2 2>/dev/null || true
    fi
  fi
}

for p in "${PORTS[@]}"; do
  kill_port "$p"
done

echo "Done. Current listeners on emulator ports:"
for p in "${PORTS[@]}"; do
  lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null || true
done

