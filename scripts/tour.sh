#!/usr/bin/env bash
# Autonomous Freight — guided tour of the live system.
# Usage:  BASE=http://95.216.199.47:8889 bash scripts/tour.sh
# Default: BASE=http://95.216.199.47:8889

set -u

BASE="${BASE:-http://95.216.199.47:8889}"

if ! command -v jq >/dev/null 2>&1; then
  echo "[tour] jq is required (brew install jq / choco install jq / apt install jq)"
  exit 1
fi

c_blue()  { printf '\033[1;34m%s\033[0m' "$1"; }
c_green() { printf '\033[1;32m%s\033[0m' "$1"; }
c_yellow(){ printf '\033[1;33m%s\033[0m' "$1"; }
c_gray()  { printf '\033[0;90m%s\033[0m' "$1"; }

step() { echo; c_blue "━━ $1"; echo; c_gray "$2"; echo; echo; }
run()  { c_yellow "\$ $1"; echo; eval "$1"; echo; }

step "1/10 Health check (public, no auth)" "Proves the gateway + nginx are reachable."
run "curl -s $BASE/health | jq"

step "2/10 Login as the demo broker" "smoke@af.test / GoodPassword99 — token is 15-minute JWT."
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@af.test","password":"GoodPassword99"}' | jq -r .accessToken)
echo "token: $(echo $TOKEN | head -c 50)..."

step "3/10 Who am I? (/me)" "Bearer token required. Returns userId, email, roles from the JWT."
run "curl -s -H 'Authorization: Bearer \$TOKEN' $BASE/me | jq"

step "4/10 Admin-only route as a broker" "Directive 011 RBAC: broker lacks admin role → 403."
run "curl -s -w '\nHTTP %{http_code}\n' -H 'Authorization: Bearer \$TOKEN' $BASE/admin/ping"

step "5/10 Same route after admin login" "Register admin + login + retry — should return 200."
curl -s -X POST $BASE/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"tour-admin@af.test","password":"AdminPass99","role":"admin"}' >/dev/null || true
ATOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"tour-admin@af.test","password":"AdminPass99"}' | jq -r .accessToken)
run "curl -s -w '\nHTTP %{http_code}\n' -H 'Authorization: Bearer \$ATOKEN' $BASE/admin/ping"

step "6/10 Carrier ranking (Sprint 3)" "Seeded shipment with 3 bids — scored deterministically by directive 030 (0.4*cost + 0.3*distance + 0.3*rating)."
run "curl -s -X POST -H 'Authorization: Bearer \$TOKEN' '$BASE/api/v1/shipments/11111111-0000-0000-0000-000000000001/select-carrier?top=3' | jq"

step "7/10 Carrier compliance + risk score (Sprint 7)" "Pure risk-score function per directive 070."
run "curl -s -H 'Authorization: Bearer \$ATOKEN' '$BASE/api/v1/carriers/22222222-0000-0000-0000-000000000001/compliance' | jq"

step "8/10 Expiring compliance artifacts (Sprint 7)" "Admin/auditor only."
run "curl -s -H 'Authorization: Bearer \$ATOKEN' '$BASE/api/v1/compliance/expiring?within_days=60' | jq"

step "9/10 MFA enroll (Sprint 6)" "Returns TOTP secret + otpauth URI to scan into Authenticator."
run "curl -s -X POST -H 'Authorization: Bearer \$TOKEN' $BASE/auth/mfa/enroll | jq"

step "10/10 Rate limiting in action (Sprint 2 / directive 020)" "Per-IP limit is 120/min by default. Firing 125 login attempts — last requests return 429."
echo -n "last 10 status codes: "
for i in $(seq 1 125); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"x","password":"x"}')
  if [[ $i -gt 115 ]]; then printf '%s ' "$CODE"; fi
done
echo
c_green "tour complete"
echo
echo "Not shown (domain exists but UX is code-only today):"
echo "  - AI tree-ensemble carrier recs (Sprint 8)      — no HTTP route in v1"
echo "  - NL search intent classifier (Sprint 9)         — no HTTP route in v1"
echo "  - GA multi-shipment optimizer (Sprint 12)        — flag-gated, no route"
echo "  - Anomaly detection on invoices (Sprint 16)      — no HTTP route in v1"
echo "  - Stripe billing (Sprint 18)                     — fails fast without live keys"
echo
echo "Full feature inventory: directives/  •  Sprint history: tmp/autonomy_log.json on the VPS"
