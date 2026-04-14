# Load tests (k6)

## Run locally

1. `docker compose up -d` (Postgres + Redis + MailHog).
2. Start the gateway: `npm run start:gateway` (or `ts-node services/api-gateway/src/index.ts`).
3. Install k6: https://k6.io/docs/get-started/installation/.
4. Run a script:
   ```bash
   k6 run -e BASE_URL=http://localhost:3000 loadtest/k6/register.js
   ```

## Thresholds

Per directive 110 (NFR alignment):

- `http_req_duration` p95 < 200 ms (carrier-select), < 250 ms (register).
- `http_req_failed` rate < 1% (most paths), < 5% (register, due to bcrypt cost).

## Notes

- Tests are gated on `BASE_URL` — never point at production without explicit approval.
- Synthetic users prefixed `loadtest+`.
