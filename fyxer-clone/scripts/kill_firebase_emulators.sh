#!/usr/bin/env bash
# stop-firebase-emulators-anyhow.sh
set -euo pipefail

DRY_RUN="${DRY_RUN:-}"  # set to any value to preview actions

log(){ printf '[emustop] %s\n' "$*"; }
curl_json(){ curl -fsS --max-time 0.4 --connect-timeout 0.12 "$1" 2>/dev/null || true; }

kill_pids(){
  local pids="$1" label="$2"
  [[ -z "${pids// }" ]] && return 0
  if [[ -n "$DRY_RUN" ]]; then
    log "Would kill $label (PIDs: $pids)"
    return 0
  fi
  log "Stopping $label (PIDs: $pids)"
  kill -TERM $pids 2>/dev/null || true
  sleep 0.5
  # Force kill any survivors
  local survivors
  survivors="$(ps -o pid= -p $pids 2>/dev/null | xargs -r echo || true)"
  [[ -z "${survivors// }" ]] || { log "Force killing $label (PIDs: $survivors)"; kill -KILL $survivors 2>/dev/null || true; }
}

# --- 1) Try the Emulator Hub (if present) ----------------------------------
# Probe all local LISTEN ports quickly for a Hub /emulators endpoint
declare -A hubs=()
while read -r port; do
  body="$(curl_json "http://127.0.0.1:${port}/emulators")"
  [[ "$body" == *'"hub"'* && "$body" == *'"port"'* ]] && hubs["127.0.0.1:${port}"]="$body"
done < <(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null \
        | sed -nE 's#.*:([0-9]+) \(LISTEN\)#\1#p' | sort -un)

if (( ${#hubs[@]} )); then
  for hp in "${!hubs[@]}"; do
    log "Found Emulator Hub at http://$hp"
    emus="${hubs[$hp]}"

    # Try graceful Firestore shutdown if present
    if grep -q '"firestore"' <<<"$emus"; then
      fs_port="$(sed -nE '/"firestore"\s*:\s*\{/,/}/p' <<<"$emus" \
                | grep -oE '"port"\s*:\s*[0-9]+' | grep -oE '[0-9]+' | head -n1)"
      [[ -n "$fs_port" ]] && curl -fsS -X POST "http://127.0.0.1:${fs_port}/shutdown" >/dev/null 2>&1 || true  # Firestore /shutdown
    fi

    # Kill listeners for every emulator the Hub reports (including the hub itself)
    readarray -t ports < <(grep -oE '"port"\s*:\s*[0-9]+' <<<"$emus" | awk -F: '{gsub(/ /,"",$2); print $2}' | sort -un)
    # Listeners only; avoids killing client connections.
    pids="$(lsof -nP -sTCP:LISTEN -tiTCP:$(IFS=,; echo "${ports[*]}") 2>/dev/null | sort -u | xargs -r echo || true)"
    kill_pids "$pids" "Hub-reported emulator listeners"
  done
  log "Done via Hub."
  exit 0
fi

# --- 2) No Hub found: kill by process fingerprints --------------------------
# Collect PIDs whose command line clearly indicates a Firebase/Google emulator.
mapfile -t suspects < <(
  # firebase-tools-launched emulators (node) and cached JARs (java)
  pgrep -fa "$HOME/.cache/firebase/emulators/" 2>/dev/null
  pgrep -fa "firebase-tools" 2>/dev/null
  # common emulator jar names (gcloud & firebase)
  pgrep -fa "cloud-firestore-emulator" 2>/dev/null
  pgrep -fa "cloud-pubsub-emulator" 2>/dev/null
)

# Extract PIDs and dedupe
pids="$(printf '%s\n' "${suspects[@]}" | awk '{print $1}' | sort -u | xargs -r echo || true)"

if [[ -z "${pids// }" ]]; then
  log "No emulator-like processes found and no Hub detected. Nothing to stop."
  exit 0
fi

# Optional: restrict to processes that are actually LISTENing on localhost
listen_pids="$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '{print $2}' | sort -u | xargs -r echo || true)"
# Intersect sets if we have both lists
if [[ -n "${listen_pids// }" ]]; then
  pids="$(comm -12 <(tr ' ' '\n' <<<"$pids" | sort -u) <(tr ' ' '\n' <<<"$listen_pids" | sort -u) | xargs -r echo || true)"
fi

kill_pids "$pids" "emulator processes (no Hub)"
log "Done (no Hub path)."
