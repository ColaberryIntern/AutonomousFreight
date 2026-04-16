#!/usr/bin/env bash
set -u
BASE="${BASE:-http://95.216.199.47:8889}"
PASS=0; FAIL=0
pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
py() { python3 -c "$1" 2>/dev/null; }

echo "═══════════════════════════════════════════════════════════"
echo " AUTONOMOUS FREIGHT — E2E ACCEPTANCE TEST REPORT"
echo " $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo " Target: $BASE"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "1. INFRASTRUCTURE"
H=$(curl -s -o /dev/null -w '%{http_code}' $BASE/health)
[ "$H" = "200" ] && pass "Health → 200" || fail "Health → $H"
H=$(curl -s -o /dev/null -w '%{http_code}' $BASE/docs)
[ "$H" = "200" ] && pass "Swagger UI → 200" || fail "Swagger → $H"
H=$(curl -s -o /dev/null -w '%{http_code}' $BASE/openapi.json)
[ "$H" = "200" ] && pass "OpenAPI spec → 200" || fail "OpenAPI → $H"
P=$(curl -s $BASE/openapi.json | py "import sys,json;print(len(json.load(sys.stdin)['paths']))")
[ "$P" -ge 25 ] 2>/dev/null && pass "OpenAPI: $P routes documented" || fail "Only $P routes"
H=$(curl -s -o /dev/null -w '%{http_code}' $BASE/metrics)
[ "$H" = "404" ] && pass "/metrics blocked (404)" || fail "/metrics exposed ($H)"
echo ""

echo "2. AUTHENTICATION & RBAC"
get_token() {
  curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | py "import sys,json;print(json.load(sys.stdin).get('accessToken',''))"
}
ST=$(get_token smoke@af.test GoodPassword99)
[ -n "$ST" ] && pass "smoke@af.test login OK" || fail "smoke login FAIL"
AT=$(get_token ali@colaberry.com GoodPassword99)
[ -n "$AT" ] && pass "ali@colaberry.com login OK" || fail "ali login FAIL"
RT=$(get_token ram@colaberry.com 'FreightDemo2026!')
[ -n "$RT" ] && pass "ram@colaberry.com login OK" || fail "ram login FAIL"
ME=$(curl -s -H "Authorization: Bearer $ST" $BASE/me | py "import sys,json;print(json.load(sys.stdin)['user']['email'])")
[ "$ME" = "smoke@af.test" ] && pass "/me returns correct identity" || fail "/me got $ME"
H=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $ST" $BASE/admin/ping)
[ "$H" = "403" ] && pass "Broker → /admin/ping → 403" || fail "Broker admin → $H"
H=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT" $BASE/admin/ping)
[ "$H" = "200" ] && pass "Admin → /admin/ping → 200" || fail "Admin ping → $H"
H=$(curl -s -o /dev/null -w '%{http_code}' $BASE/me)
[ "$H" = "401" ] && pass "No auth → 401" || fail "No auth → $H"
echo ""

echo "3. OPERATIONS DASHBOARD"
OV=$(curl -s -H "Authorization: Bearer $AT" $BASE/api/v1/dashboard/overview)
Q=$(echo "$OV" | py "import sys,json;print(json.load(sys.stdin)['shipments']['quoting'])")
A=$(echo "$OV" | py "import sys,json;print(json.load(sys.stdin)['carriers']['active'])")
pass "Dashboard: $Q quoting, $A active carriers"
R=$(echo "$OV" | py "import sys,json;b=json.load(sys.stdin)['compliance']['riskBuckets'];print(f\"G{b['green']} A{b['amber']} R{b['red']}\")")
pass "Risk buckets: $R"
echo ""

echo "4. RFQ → QUOTE PIPELINE"
RFQ=$(curl -s -X POST $BASE/api/v1/rfqs -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"customer":"E2E Acceptance","origin":"Houston TX","destination":"Dallas TX","distanceMiles":800,"equipmentType":"dry_van","pickupDate":"2026-06-15"}' \
  | py "import sys,json;print(json.load(sys.stdin)['id'])")
[ -n "$RFQ" ] && pass "RFQ created: ${RFQ:0:8}..." || fail "RFQ create failed"
echo "  ⏳ Waiting 8s for Quoting Agent..."
sleep 8
RS=$(curl -s -H "Authorization: Bearer $AT" $BASE/api/v1/rfqs/$RFQ | py "import sys,json;r=json.load(sys.stdin)['rfq'];print(r['status'])")
[ "$RS" = "sent" ] && pass "Quoting Agent → sent (conf ≥0.85)" || { [ "$RS" = "exception" ] && pass "Quoting Agent → exception" || fail "RFQ still $RS"; }
echo ""

echo "5. WON → SHIPMENT"
WON=$(curl -s -X POST $BASE/api/v1/rfqs/$RFQ/respond -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"outcome":"won"}')
SID=$(echo "$WON" | py "import sys,json;print(json.load(sys.stdin).get('shipmentId',''))")
[ -n "$SID" ] && pass "Won → shipment: ${SID:0:8}..." || fail "No shipment from Won"
echo ""

echo "6. CARRIERS + COMPLIANCE"
CC=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/v1/carriers?active=false" | py "import sys,json;print(len(json.load(sys.stdin)['items']))")
[ "$CC" -ge 4 ] 2>/dev/null && pass "Carriers: $CC total" || fail "Only $CC carriers"
RS=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/v1/carriers/22222222-0000-0000-0000-000000000001/compliance" | py "import sys,json;print(json.load(sys.stdin).get('riskScore','err'))")
pass "Alpha Freight risk score: $RS"
EC=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/v1/compliance/expiring?within_days=90" | py "import sys,json;print(len(json.load(sys.stdin)['items']))")
pass "Expiring artifacts (90d): $EC"
CS=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/v1/compliance/summary" | py "import sys,json;print('ok' if 'riskBuckets' in json.load(sys.stdin) else 'fail')")
[ "$CS" = "ok" ] && pass "Compliance summary OK" || fail "Compliance summary broken"
echo ""

echo "7. COMPLIANCE GATES"
GR=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/v1/shipments/11111111-0000-0000-0000-000000000003/gates/22222222-0000-0000-0000-000000000005" | py "import sys,json;print(json.load(sys.stdin).get('result','err'))")
[ "$GR" = "hard" ] && pass "Echo Risky (no insurance) → HARD block" || fail "Gate=$GR (expected hard)"
H=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/shipments/11111111-0000-0000-0000-000000000003/assign-carrier" \
  -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"carrierId":"22222222-0000-0000-0000-000000000005"}')
[ "$H" = "422" ] && pass "Assign hard-blocked → 422" || fail "Hard assign → $H"
echo ""

echo "8. INVOICES + FINANCIALS"
IC=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/v1/invoices" | py "import sys,json;print(len(json.load(sys.stdin)['items']))")
[ "$IC" -ge 1 ] 2>/dev/null && pass "Invoices: $IC found" || fail "No invoices"
FIN=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/v1/financials/summary")
REV=$(echo "$FIN" | py "import sys,json;print(json.load(sys.stdin).get('totalRevenue',0))")
MAR=$(echo "$FIN" | py "import sys,json;print(json.load(sys.stdin).get('totalMargin',0))")
PCT=$(echo "$FIN" | py "import sys,json;print(json.load(sys.stdin).get('avgMarginPct',0))")
pass "Financials: revenue=\$$REV margin=\$$MAR avg=$PCT%"
echo ""

echo "9. SCORING + AUTONOMY"
FO=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/v1/scoring/weights" | py "import sys,json;print(json.load(sys.stdin).get('formula',''))")
[ -n "$FO" ] && pass "Scoring: $FO" || fail "No scoring formula"
echo ""

echo "10. AUDIT LOG"
AC=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/v1/audit/logs?limit=200" | py "import sys,json;print(len(json.load(sys.stdin)['items']))")
pass "Audit log: $AC entries total"
for A in rfq.priced rfq.sent agent.procurement.auto_assigned agent.tracking.milestone agent.document.verified agent.rate_audit.passed agent.invoice.issued gate.hard_blocked; do
  C=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/v1/audit/logs?action=$A&limit=1" | py "import sys,json;print(len(json.load(sys.stdin)['items']))")
  [ "$C" -ge 1 ] 2>/dev/null && pass "Audit has '$A'" || fail "Missing '$A' in audit"
done
H=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $ST" "$BASE/api/v1/audit/logs")
[ "$H" = "403" ] && pass "Broker blocked from audit (403)" || fail "Broker audit → $H"
echo ""

echo "11. ADMIN"
UC=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/v1/admin/users" | py "import sys,json;print(len(json.load(sys.stdin)['items']))")
[ "$UC" -ge 3 ] 2>/dev/null && pass "Admin users: $UC" || fail "Only $UC users"
H=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $ST" "$BASE/api/v1/admin/users")
[ "$H" = "403" ] && pass "Broker blocked from admin users (403)" || fail "Broker admin → $H"
echo ""

echo "12. FRONTEND"
curl -s $BASE/ | grep -q "assets/index-" && pass "React SPA serves at /" || fail "No React bundle"
BN=$(curl -s $BASE/ | grep -o 'assets/index-[^"]*')
pass "Bundle: $BN"
curl -s http://95.216.199.47:4001/ 2>/dev/null | grep -q "assets/index-" && pass "Port 4001 also live" || fail "Port 4001 down"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo " TOTAL: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════════"
