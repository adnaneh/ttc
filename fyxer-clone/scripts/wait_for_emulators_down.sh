#!/usr/bin/env bash
set -euo pipefail

# Wait until all expected Firebase emulator ports are free.
# Includes Functions(5001), Firestore(8080), Auth(9099), Realtime DB(9000),
# Pub/Sub(8085), Storage(9199), UI(4000), Hub(4400).

ports_regex=':(5001|8080|9099|9000|8085|9199|4000|4400)\b'

for i in {1..60}; do
  if ! lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -E -q "$ports_regex"; then
    printf '[emuwait] all emulator ports are free\n'
    exit 0
  fi
  printf '[emuwait] waiting for emulators to exit...\n'
  sleep 0.25
done

printf '[emuwait] continuing anyway (timeout)\n'
exit 0

