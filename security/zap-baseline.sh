#!/usr/bin/env bash
# Sprint 17 — OWASP ZAP baseline scan against a non-prod gateway.
# Usage: BASE_URL=http://localhost:3000 bash security/zap-baseline.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

if [[ "$BASE_URL" == *"prod"* || "$BASE_URL" == *"production"* ]]; then
  echo "[zap] refusing to scan a production-looking URL: $BASE_URL" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[zap] docker not found — install docker first" >&2
  exit 1
fi

echo "[zap] running baseline against $BASE_URL"
docker run --rm -t \
  --network host \
  -v "$(pwd)/security:/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t "$BASE_URL" -c /zap/wrk/zap-rules.tsv -I

echo "[zap] baseline complete — review report"
