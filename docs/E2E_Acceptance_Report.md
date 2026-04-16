# Autonomous Freight — End-to-End Acceptance Test Report

**Date:** 2026-04-16 16:12 UTC
**Target:** http://95.216.199.47:8889 (Hetzner VPS, Helsinki)
**Tester:** Claude Code (automated)
**Result:** **41/41 PASSED — 0 FAILURES**

---

## 1. Infrastructure (5/5 ✅)

| Test | Result | Detail |
|---|---|---|
| Health endpoint | ✅ | `GET /health` → 200 `{"status":"ok"}` |
| Swagger UI | ✅ | `GET /docs` → 200 (CDN-loaded Swagger UI) |
| OpenAPI spec | ✅ | `GET /openapi.json` → 200, **26 routes documented** |
| /metrics blocked | ✅ | Returns 404 at nginx edge (security) |
| Port 4001 mirror | ✅ | Same frontend + backend accessible on alternate port |

## 2. Authentication & RBAC (7/7 ✅)

| Test | Result | Detail |
|---|---|---|
| smoke@af.test login | ✅ | JWT issued (broker role) |
| ali@colaberry.com login | ✅ | JWT issued (admin + broker roles) |
| ram@colaberry.com login | ✅ | JWT issued (admin role) |
| /me identity | ✅ | Returns correct email from JWT |
| Broker → admin route | ✅ | 403 Forbidden (RBAC enforced) |
| Admin → admin route | ✅ | 200 OK |
| No auth → protected route | ✅ | 401 Unauthorized |

## 3. Operations Dashboard (2/2 ✅)

| Test | Result | Detail |
|---|---|---|
| Overview stats | ✅ | 3 quoting shipments, 4 active carriers |
| Risk distribution | ✅ | Green: 1, Amber: 2, Red: 1 |

## 4. RFQ → Quote Pipeline (2/2 ✅)

| Test | Result | Detail |
|---|---|---|
| RFQ creation | ✅ | POST → `received` state, UUID assigned |
| Quoting Agent auto-prices | ✅ | Within 8s: priced → `sent` (confidence ≥ 0.85 for 800mi dry van) |

## 5. Won → Shipment Materialization (1/1 ✅)

| Test | Result | Detail |
|---|---|---|
| Won response creates shipment | ✅ | `POST /respond {outcome:"won"}` → shipment UUID returned, status = `quoting` |

## 6. Carriers + Compliance (4/4 ✅)

| Test | Result | Detail |
|---|---|---|
| Carrier list | ✅ | 5 carriers (including 1 inactive) |
| Compliance snapshot | ✅ | Alpha Freight risk score = 0 (clean) |
| Expiring artifacts | ✅ | 2 artifacts within 90-day window |
| Compliance summary | ✅ | Risk buckets + artifact type counts returned |

## 7. Compliance Gates (2/2 ✅)

| Test | Result | Detail |
|---|---|---|
| Hard gate detection | ✅ | Echo Risky LLC (no insurance) → `hard` block, findings include `no_insurance` |
| Hard gate enforcement | ✅ | `POST /assign-carrier` → **422** `compliance_blocked`. Shipment stays in `quoting`. |

## 8. Invoices + Financials (2/2 ✅)

| Test | Result | Detail |
|---|---|---|
| Invoice exists | ✅ | 1 invoice: AF-INV-1001 |
| Financial summary | ✅ | Revenue: $1,755 · Margin: $755 · Avg: 43.02% |

## 9. Scoring Explainability (1/1 ✅)

| Test | Result | Detail |
|---|---|---|
| Weights + formula | ✅ | `score = 0.4*cost_norm + 0.3*distance_norm + 0.3*rating_norm` |

## 10. Audit Log (10/10 ✅)

| Test | Result | Detail |
|---|---|---|
| Total entries | ✅ | 200+ audit log rows |
| `rfq.priced` | ✅ | Quoting Agent priced an RFQ |
| `rfq.sent` | ✅ | Quoting Agent auto-sent |
| `agent.procurement.auto_assigned` | ✅ | Procurement Agent assigned a carrier |
| `agent.tracking.milestone` | ✅ | Tracking Agent recorded a milestone |
| `agent.document.verified` | ✅ | Document Agent validated a BOL |
| `agent.rate_audit.passed` | ✅ | Rate Audit Agent passed margin check |
| `agent.invoice.issued` | ✅ | Invoice Agent generated an invoice |
| `gate.hard_blocked` | ✅ | Compliance gate blocked an assignment |
| Broker cannot access audit | ✅ | 403 (admin-only) |

## 11. Admin (2/2 ✅)

| Test | Result | Detail |
|---|---|---|
| Users list | ✅ | 4 users returned (smoke, ali, ram, tour-admin) |
| Broker blocked | ✅ | 403 on admin endpoints |

## 12. Frontend (3/3 ✅)

| Test | Result | Detail |
|---|---|---|
| React SPA loads | ✅ | index.html + Vite bundle served |
| Bundle version | ✅ | `assets/index-Df9vc3rn.js` |
| Port 4001 live | ✅ | Same content on alternate port |

---

## Issues Found & Fixed During This Session

| # | Issue | Root cause | Fix | Commit |
|---|---|---|---|---|
| 1 | App.tsx cockpit shell never deployed | Write tool silently no-op'd; old 3-tab version persisted | Re-wrote App.tsx + verified diff + committed | `d51b22a` |
| 2 | Lockfile missing `@af/rfq` workspace | npm install not re-run after adding new workspace | `npm install` + committed lockfile | `e053f21` |
| 3 | RFQ migrations not in Docker dist | `scripts/copy-migrations.js` SERVICES array missed `rfq` | Added `rfq` to the array | `3e9a957` |
| 4 | ali@colaberry.com password mismatch | Registered with `GmailTestPassword99` during Gmail test; told user `GoodPassword99` | Bcrypt-rehashed password in DB via container Node script | Runtime fix (no commit) |
| 5 | MFA partially enrolled on ali@colaberry.com | Tour script ran `/auth/mfa/enroll`; login then returns `mfaRequired:true` | Reset `mfa_enabled=FALSE`, cleared `mfa_secret_enc` | Runtime fix |
| 6 | `FEATURE_TRACKING_SIM` not passed to container | docker-compose.production.yml missing the env pass-through | Added `FEATURE_TRACKING_SIM: ${...}` to compose | `572a200` |
| 7 | `GMAIL_*` env vars not passed to container | docker-compose.production.yml missing the env pass-through | Added 3 GMAIL env vars to compose | `12a275d` |
| 8 | Port 4001 `shipces-frontend` returns HTML on POST /auth/login | Colaberry portal auto-deployed a frontend-only container with `serve` (no proxy) | Replaced with our `autonomous-freight-nginx` image | Runtime fix (recurring) |
| 9 | nginx 405 Not Allowed on login | Browser cached old JS bundle (1-year `Cache-Control: immutable`) | Rebuilt nginx `--no-cache`, new bundle hash (`Df9vc3rn`) | Runtime fix |
| 10 | Rate audit flagged test shipment as exception | Test shipment had only 3.1% margin (below 5% threshold) | Correct behavior — created a proper 43% margin test | Not a bug |

---

## Agent Fleet Status

| # | Agent | Status | Audit action verified |
|---|---|---|---|
| 1 | Quoting Agent | ✅ Running (5s loop) | `rfq.priced`, `rfq.sent`, `rfq.exception` |
| 2 | Procurement Agent | ✅ Running | `agent.procurement.auto_assigned` |
| 3 | Tracking Agent | ✅ Running (FEATURE_TRACKING_SIM=true) | `agent.tracking.milestone` |
| 4 | Document Agent | ✅ Running | `agent.document.verified` |
| 5 | Rate Audit Agent | ✅ Running | `agent.rate_audit.passed` |
| 6 | Invoice Agent | ✅ Running | `agent.invoice.issued` |
| 7 | Payment Match Agent | ✅ Deployed (V-5, awaiting paid invoices) | — |
| 8 | Settlement Agent | ✅ Deployed (V-5) | — |
| 9 | Dispute Agent | ✅ Deployed (V-5) | — |

---

## Verified Lifecycle (RFQ to Invoice)

```
RFQ received
  → Quoting Agent prices ($1,755 dry van 800mi, conf 0.99)
    → auto-sent (conf ≥ 0.85)
      → Customer Won → Shipment materialized (quoting)
        → Carrier bid ($1,000) → Procurement Agent auto-assigns
          → Tracking Agent: 5 milestones → delivered
            → BOL uploaded → Document Agent → doc_verified
              → Rate Audit Agent: 43% margin → rate_audited
                → Invoice Agent: AF-INV-1001 issued
```

Every step audited. Every compliance gate enforced. Every agent action traceable.

---

## System Inventory

| Metric | Count |
|---|---|
| Named agents running | 9 (6 verified in audit, 3 deployed awaiting triggers) |
| Directives authored | 29 |
| HTTP routes documented | 26 |
| Database tables | 14 |
| Test suite | 220+ (163 unit + 55 integration + 2 E2E) |
| Acceptance tests (this report) | 41/41 passed |
| Commits on main | 25+ |
| Deploy target | Hetzner VPS 95.216.199.47 (ports 8889 + 4001) |

---

*Report generated by `scripts/e2e-acceptance.sh` — rerunnable at any time.*
