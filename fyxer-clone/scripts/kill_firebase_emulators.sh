#!/usr/bin/env bash
set -euo pipefail

# Attempt to stop Firebase emulators by process pattern first,
# then fall back to killing listeners by known ports.

# Common Firebase emulator process patterns (CLI + spawned runtimes)
# Kept specific to avoid killing unrelated "firebase" commands.
PATTERNS=(
  '(^|/|\s)firebase(\s|$).*emulators?:start'     # firebase emulators:start invocations
  'node .*firebase-tools.*emulators?'              # node-backed firebase-tools runners
  'cloud-firestore-emulator'                      # Firestore emulator (Java jar)
  'google-?cloud-?pubsub.*emulator'               # Pub/Sub emulator
  'storage-?rules'                                # Storage rules runtime
  'functions-?emulator'                           # Older functions emulator naming
  'firebase.*(emulator|emulators).*hub'           # Emulator hub
  'firebase.*(emulator|emulators).*ui'            # Emulator UI
)

kill_pattern() {
  local pattern=$1
  if pids=$(pgrep -f "$pattern" 2>/dev/null) && [[ -n "$pids" ]]; then
    echo "Killing processes matching '$pattern': $pids"
    # Try graceful termination first
    kill -TERM $pids 2>/dev/null || true
    sleep 0.5
    # Force kill any survivors of this pattern
    if pids2=$(pgrep -f "$pattern" 2>/dev/null) && [[ -n "$pids2" ]]; then
      echo "Force killing processes matching '$pattern': $pids2"
      kill -KILL $pids2 2>/dev/null || true
    fi
  fi
}

echo "Stopping Firebase emulators by process pattern..."
for pat in "${PATTERNS[@]}"; do
  kill_pattern "$pat"
done

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

echo "Cleaning up any remaining emulator listeners by port..."
for p in "${PORTS[@]}"; do
  kill_port "$p"
done

# Kill any stray ngrok processes (to avoid "endpoint already online" conflicts)
if pids=$(pgrep -f "(^|/)ngrok(\s|$)" 2>/dev/null) && [[ -n "$pids" ]]; then
  echo "Killing ngrok processes: $pids"
  kill -TERM $pids 2>/dev/null || true
  sleep 0.3
  if pids2=$(pgrep -f "(^|/)ngrok(\s|$)" 2>/dev/null) && [[ -n "$pids2" ]]; then
    echo "Force killing ngrok: $pids2"
    kill -KILL $pids2 2>/dev/null || true
  fi
fi

echo "Done. Current listeners on emulator ports:"
for p in "${PORTS[@]}"; do
  lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null || true
done

