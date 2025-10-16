#!/usr/bin/env bash
# stop-firebase-emulators.sh
set -euo pipefail

# --- Options ---------------------------------------------------------------
DRY_RUN="${DRY_RUN:-}"   # set to any value to only print what would be killed

# --- Helpers ---------------------------------------------------------------
log() { printf '[emustop] %s\n' "$*"; }

curl_json() (
  # fast local GET with tiny timeouts; prints body or nothing
  curl -fsS --max-time 0.5 --connect-timeout 0.15 "$1" 2>/dev/null || true
)

# Try to locate the Emulator Hub (host:port) without assuming a port.
find_hub() {
  local cand emus

  # 1) Honor FIREBASE_EMULATOR_HUB if provided (format: host:port)
  if [[ -n "${FIREBASE_EMULATOR_HUB:-}" ]]; then
    cand="$FIREBASE_EMULATOR_HUB"
    emus="$(curl_json "http://${cand}/emulators")"
    [[ -n "$emus" ]] && { echo "$cand"; printf '%s' "$emus" >"$TMP/emulators.json"; return 0; }
  fi

  # 2) If firebase.json specifies "emulators.hub.port", try that
  if [[ -f firebase.json ]]; then
    # naive parse without jq
    if hub_port="$(grep -oE '"hub"\s*:\s*\{[^}]*"port"\s*:\s*[0-9]+' -m1 firebase.json \
                    | grep -oE '[0-9]+' | head -n1)"; then
      cand="127.0.0.1:${hub_port}"
      emus="$(curl_json "http://${cand}/emulators")"
      [[ -n "$emus" ]] && { echo "$cand"; printf '%s' "$emus" >"$TMP/emulators.json"; return 0; }
    fi
  fi

  # 3) Try the documented default (still no hard dependency if it moved)
  for cand in "127.0.0.1:4400" "localhost:4400"; do
    emus="$(curl_json "http://${cand}/emulators")"
    [[ -n "$emus" ]] && { echo "$cand"; printf '%s' "$emus" >"$TMP/emulators.json"; return 0; }
  done

  # 4) Probe local listeners: hit /emulators on each LISTENing port quickly
  #    Only localhost-bound ports to keep it fast.
  while read -r port; do
    cand="127.0.0.1:${port}"
    emus="$(curl_json "http://${cand}/emulators")"
    # Heuristic: JSON that mentions the hub section
    if [[ "$emus" == *'"hub"'* && "$emus" == *'"port"'* ]]; then
      echo "$cand"
      printf '%s' "$emus" >"$TMP/emulators.json"
      return 0
    fi
  done < <(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null \
            | awk '{print $9}' \
            | sed -nE 's#(127\.0\.0\.1|localhost):([0-9]+).*#\2#p' \
            | sort -un)

  return 1
}

# Kill all processes listening on a given port (TERM then KILL)
kill_port() {
  local port="$1" pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -z "${pids:-}" ]] && return 0
  if [[ -n "$DRY_RUN" ]]; then
    log "Would kill listeners on :$port (PIDs: $pids)"
    return 0
  fi
  log "Stopping listeners on :$port (PIDs: $pids)"
  kill -TERM $pids 2>/dev/null || true
  sleep 0.5
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -z "${pids:-}" ]] || { log "Force killing :$port (PIDs: $pids)"; kill -KILL $pids 2>/dev/null || true; }
}

# --- Main ------------------------------------------------------------------
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
# Allow callers to tweak how long we wait for ports to fully close
WAIT_SECS="${WAIT_SECS:-5}"

if ! HUB="$(find_hub)"; then
  log "Could not find the Emulator Hub (/emulators). Nothing to do."
  exit 0
fi
log "Found Emulator Hub at http://${HUB}"

# emulators.json now exists; extract name->port pairs without jq
emap="$(cat "$TMP/emulators.json")"

# Try graceful shutdown for Firestore if present (documented endpoint)
if fs_port="$(printf '%s' "$emap" \
            | sed -nE '/"firestore"\s*:\s*\{/,/}/p' \
            | grep -oE '"port"\s*:\s*[0-9]+' | tail -n1 | grep -oE '[0-9]+')"; then
  if [[ -n "$DRY_RUN" ]]; then
    log "Would POST /shutdown to Firestore on :$fs_port"
  else
    curl -fsS -X POST "http://127.0.0.1:${fs_port}/shutdown" >/dev/null 2>&1 || true
  fi
fi

# Collect all ports reported by the hub (hub itself included)
readarray -t ports < <(printf '%s' "$emap" \
  | grep -oE '"port"\s*:\s*[0-9]+' | awk -F: '{gsub(/ /,"",$2); print $2}' | sort -un)

# TERM then KILL any remaining listeners for each discovered port
for sig in TERM KILL; do
  for p in "${ports[@]}"; do
    if [[ -n "$DRY_RUN" && "$sig" == "TERM" ]]; then
      pids="$(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)"
      [[ -z "${pids:-}" ]] || log "Would send $sig to :$p (PIDs: $pids)"
    else
      kill_port "$p"
    fi
  done
  [[ "$sig" == "TERM" ]] && sleep 0.6
done

log "Done. Active listeners (if any) reported by Hub were: ${ports[*]}"

# --- Post-wait: ensure hub/ports have really gone away to avoid race on restart ----
if [[ -z "$DRY_RUN" ]]; then
  log "Waiting (up to ${WAIT_SECS}s) for emulator ports to fully close..."
  end=$((SECONDS + WAIT_SECS))
  while (( SECONDS < end )); do
    any_listening=false
    # If we still have the hub host:port, prefer checking it directly too
    if [[ -n "${HUB:-}" ]]; then
      if curl -fsS --max-time 0.25 --connect-timeout 0.1 "http://${HUB}/emulators" >/dev/null 2>&1; then
        any_listening=true
      fi
    fi
    if [[ $any_listening == false ]]; then
      for p in "${ports[@]}"; do
        if lsof -tiTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
          any_listening=true
          break
        fi
      done
    fi
    if [[ $any_listening == false ]]; then
      log "All reported emulator ports are closed."
      break
    fi
    sleep 0.2
  done
fi

# --- Clean up Hub locator file to prevent false "multiple instances" warning ---
# Firebase CLI writes a locator JSON to os.tmpdir(): hub-<projectId>.json. If the
# process is killed forcefully, that file can linger and trigger the warning on next start.
cleanup_locator() {
  local project_id="$1"; [[ -z "$project_id" ]] && return 0
  local deleted=0
  for td in "${TMPDIR:-/tmp}" "/tmp"; do
    local f="${td%/}/hub-${project_id}.json"
    if [[ -f "$f" ]]; then
      if [[ -n "$DRY_RUN" ]]; then
        log "Would remove hub locator: $f"
      else
        rm -f -- "$f" && { log "Removed hub locator: $f"; deleted=1; }
      fi
    fi
  done
  return $deleted
}

detect_project_id() {
  # Priority: explicit envs -> .firebaserc default
  if [[ -n "${FIREBASE_PROJECT:-}" ]]; then echo "$FIREBASE_PROJECT"; return; fi
  if [[ -n "${GOOGLE_CLOUD_PROJECT:-}" ]]; then echo "$GOOGLE_CLOUD_PROJECT"; return; fi
  if [[ -n "${GCLOUD_PROJECT:-}" ]]; then echo "$GCLOUD_PROJECT"; return; fi
  if [[ -f .firebaserc ]]; then
    # naive extraction of default project
    local pid
    pid="$(grep -oE '"default"\s*:\s*"[^"]+"' -m1 .firebaserc | sed -E 's/.*"default"\s*:\s*"([^"]+)".*/\1/')"
    [[ -n "$pid" ]] && { echo "$pid"; return; }
  fi
  echo ""
}

PROJECT_ID="$(detect_project_id)"
if [[ -n "$PROJECT_ID" ]]; then
  cleanup_locator "$PROJECT_ID" || true
else
  log "Project id not detected; skipping hub locator cleanup."
fi
