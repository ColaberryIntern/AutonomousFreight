#!/usr/bin/env bash
#
# run-shipces-scrum.sh - cron wrapper for the ShipCES daily delivery report.
#
# Why this exists: the previous cron was a single `cp && cp && exec` chain
# reading from /opt/colaberry-accelerator/cron/. That directory is inside the
# accelerator deploy tree and has been wiped twice (Jul 12 and again around
# Jul 22) by compose/repo rewrites. When it vanishes the `cp` fails, the `&&`
# chain short-circuits, and the job exits 0-ish with nothing in the log. The
# report went silent from Jul 17 to Aug 6 and nobody was told.
#
# Two fixes:
#   1. SRC_DIR lives outside the accelerator deploy tree, so a repo reset or a
#      compose rewrite cannot take it out.
#   2. Every precondition is checked explicitly and every failure writes a
#      timestamped FAIL line to the log. Silence now means "cron did not run",
#      not "cron ran and quietly did nothing".
#
# Install: /opt/shipces-scrum/run-shipces-scrum.sh (root:root, mode 755, LF).
# Invoked by /etc/cron.d/shipces-scrum at 07:55 America/Chicago, Mon-Fri.
#
# Args are passed through to dailyScrum.js (e.g. --test sends to Ali only).

set -uo pipefail

SRC_DIR="${SHIPCES_SCRUM_SRC:-/opt/shipces-scrum}"
STACK_DIR="${SHIPCES_STACK_DIR:-/opt/colaberry-accelerator}"
COMPOSE_FILE="${SHIPCES_COMPOSE_FILE:-docker-compose.production.yml}"
SERVICE="${SHIPCES_SERVICE:-backend}"
LOG="${SHIPCES_SCRUM_LOG:-/var/log/shipces-scrum.log}"
FILES="dailyScrum.js deliverables.js"

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "$(ts) $*" >> "$LOG"; }
die() { log "FAIL $*"; exit 1; }

log "START run-shipces-scrum.sh args=[$*]"

# Precondition 1: source files present in the durable directory.
for f in $FILES; do
  [ -r "$SRC_DIR/$f" ] || die "missing source file $SRC_DIR/$f (the report cannot run; restore it from the repo at scripts/shipces-daily-scrum/)"
done

# Precondition 2: the stack directory and compose file still exist.
[ -d "$STACK_DIR" ] || die "stack dir $STACK_DIR not found"
[ -r "$STACK_DIR/$COMPOSE_FILE" ] || die "compose file $STACK_DIR/$COMPOSE_FILE not found"

cd "$STACK_DIR" || die "cannot cd to $STACK_DIR"

# Precondition 3: the target container is actually up.
if ! docker compose -f "$COMPOSE_FILE" ps --status running --services 2>/dev/null | grep -qx "$SERVICE"; then
  die "service '$SERVICE' is not running in $COMPOSE_FILE"
fi

# Copy both files every run. The container is rebuilt often and does not carry
# them in its image, so a stale or absent copy is the normal state at 07:55.
for f in $FILES; do
  if ! out=$(docker compose -f "$COMPOSE_FILE" cp "$SRC_DIR/$f" "$SERVICE:/app/$f" 2>&1); then
    die "cp $f into $SERVICE failed: $out"
  fi
done
log "OK copied [$FILES] into $SERVICE:/app/"

# Run the report. Its own stdout carries the Mandrill message id or FAILED line.
out=$(docker compose -f "$COMPOSE_FILE" exec -T -w /app "$SERVICE" node /app/dailyScrum.js "$@" 2>&1)
rc=$?
while IFS= read -r line; do
  [ -n "$line" ] && log "REPORT $line"
done <<< "$out"

if [ $rc -ne 0 ]; then
  die "dailyScrum.js exited $rc"
fi
if ! grep -q '^Sent: ' <<< "$out"; then
  die "dailyScrum.js exited 0 but printed no 'Sent:' line (nothing was delivered)"
fi

log "DONE report sent"
exit 0
