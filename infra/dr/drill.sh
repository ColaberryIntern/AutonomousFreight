#!/usr/bin/env bash
# Sprint 15 — local DR drill. Simulates a Postgres restart from snapshot and re-runs smoke tests.
set -euo pipefail

if [[ "${NODE_ENV:-}" == "production" ]]; then
  echo "[drill] refusing to run in production" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[drill] docker not found — install docker first" >&2
  exit 1
fi

START=$(date +%s)
SNAPSHOT="/tmp/af-drill-$(date +%s).sql"

echo "[drill] taking snapshot → $SNAPSHOT"
docker exec af-postgres pg_dump -U freight freight_dev > "$SNAPSHOT"

echo "[drill] stopping af-postgres"
docker stop af-postgres
echo "[drill] starting af-postgres"
docker start af-postgres

echo "[drill] waiting for readiness"
for _ in {1..30}; do
  if docker exec af-postgres pg_isready -U freight 2>&1 | grep -q accepting; then
    break
  fi
  sleep 1
done

echo "[drill] restoring snapshot"
docker exec -i af-postgres psql -U freight -d freight_dev < "$SNAPSHOT" >/dev/null

echo "[drill] running smoke tests"
DATABASE_URL="postgres://freight:freight@localhost:5434/freight_dev" npm run test:e2e

END=$(date +%s)
ELAPSED=$((END - START))
echo "[drill] success — elapsed ${ELAPSED}s (RTO budget 3600s)"
