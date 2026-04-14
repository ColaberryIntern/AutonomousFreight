# Deployment — Autonomous Freight on VPS 95.216.199.47

This supersedes the Sprint 13 EKS escalation: we deploy via docker-compose on the existing Hetzner VPS, following the same pattern as the Colaberry Accelerator stack.

## Target topology

| Component              | Host port    | Internal port | Container          | Notes                                                                     |
| ---------------------- | ------------ | ------------- | ------------------ | ------------------------------------------------------------------------- |
| nginx (public ingress) | **8889**     | 80            | `af-prod-nginx`    | serves React + proxies `/api/*`, `/auth/*`, `/health`, `/me` to gateway   |
| API gateway            | — (internal) | 3000          | `af-prod-gateway`  | Node 20 runtime, non-root user                                            |
| Postgres 16            | — (internal) | 5432          | `af-prod-postgres` | isolated volume; the VPS's shared `pgvector/pgvector:pg15` is NOT touched |
| Redis 7                | — (internal) | 6379          | `af-prod-redis`    | cache + session revocation backing store                                  |

**Public entry point:** `http://95.216.199.47:8889` (or a Cloudflare subdomain pointing there).

## Port-map integration with existing services

| Existing                         | New                                                             |
| -------------------------------- | --------------------------------------------------------------- |
| 8888 accelerator prod            | 8889 autonomous-freight                                         |
| 9999 / 9998 accelerator dev/dev2 | untouched                                                       |
| 5432 shared pg15                 | untouched (we run our own pg16 on the internal compose network) |

## One-time VPS setup

```bash
ssh root@95.216.199.47
mkdir -p /opt/autonomous-freight
cd /opt/autonomous-freight

# Clone the repo
git clone https://github.com/ColaberryIntern/AutonomousFreight.git .

# Copy + edit the env template
cp .env.production.example .env
${EDITOR:-nano} .env
# Set POSTGRES_PASSWORD, JWT_ACCESS_SECRET, MFA_KEK, SMTP_* at minimum.

# First build + up
docker compose -p autonomous-freight \
  -f docker-compose.production.yml \
  up -d --build

# Verify
curl -fsS http://127.0.0.1:8889/health
# → {"status":"ok"}
```

## Updates

```bash
cd /opt/autonomous-freight
git pull
docker compose -p autonomous-freight \
  -f docker-compose.production.yml \
  up -d --build
```

Migrations run automatically on gateway startup (idempotent SQL in `services/*/src/repo/migrations/`).

## Rollback

```bash
cd /opt/autonomous-freight
git log --oneline -n 10   # pick a known-good SHA
git checkout <SHA>
docker compose -p autonomous-freight \
  -f docker-compose.production.yml \
  up -d --build
```

For DB-level rollback, restore from the `af-prod-postgres` volume snapshot (runbook at `infra/dr/runbook.md`).

## Cloudflare / DNS (owner action)

1. Add A record: `freight.<your-domain>` → `95.216.199.47`.
2. Under Rules → Origin Rules, rewrite the origin port to `8889`.
3. Enable orange-cloud proxy for TLS termination at Cloudflare's edge (no cert work on the VPS for v1; add Let's Encrypt later if Cloudflare origin proxy is insufficient).

If you're not using Cloudflare, reach it directly at `http://95.216.199.47:8889` — fine for a pilot, not for production users.

## Smoke test post-deploy

```bash
BASE=http://127.0.0.1:8889

# Register
curl -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@af.test","password":"GoodPassword99"}'

# Login → capture token
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@af.test","password":"GoodPassword99"}' | jq -r .accessToken)

# Protected route
curl -s -H "Authorization: Bearer $TOKEN" $BASE/me | jq
```

## What's intentionally NOT exposed publicly

nginx blocks these at the edge — they're available only inside the compose network:

- `/metrics` (Prometheus scrape target)
- `/openapi.json` (API contract — re-enable behind auth later if needed)

## Sharing the existing pg15 (optional future pivot)

If you later want to drop our Postgres container and share the existing `pgvector/pgvector:pg15`:

1. Join `prod_network`: change the compose file's `networks.default` to `external: true, name: prod_network`.
2. Remove our `postgres` service + `af-prod-postgres` volume.
3. Point `DATABASE_URL` at the shared host: `postgres://<user>:<pw>@<existing-pg-container>:5432/freight_prod`.
4. Create the DB on the shared instance first:
   ```bash
   docker exec -it <pg15-container> psql -U postgres -c "CREATE DATABASE freight_prod OWNER freight;"
   ```

This is a Sprint-23-style optimization; MVP runs with the isolated Postgres.

## Open governance items still requiring approval

- **Stripe activation** — still gated (see `tmp/escalation.json`). Billing routes remain stubbed until `STRIPE_SECRET_KEY` is set + verified.
