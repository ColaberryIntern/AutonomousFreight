# ShipCES daily scrum report

Automated daily stand-up snapshot for the **ShipCES - Autonomous Brokerage**
Basecamp project (id `47126345`). Emails an HTML report each weekday morning so
anyone looking in can see what has been worked on, what is in progress, and what
is coming, broken down by list, with a Gantt-style upcoming view, a birds-eye of
the build layers, milestone anchors, and conditional color (on time vs late).

## Files

- `dailyScrum.js` - the generator + sender. Pulls live Basecamp data, renders the
  HTML email, and sends via Mandrill. Self-contained (only `mssql` + `nodemailer`,
  both already in the backend image; `https` is built in).
- `shipces-scrum.cron` - the cron definition installed at `/etc/cron.d/shipces-scrum`.

## How it runs

It runs **inside the `accelerator-backend` container** on the production VPS,
because that container already holds every credential it needs in its env:

- `MSSQL_HOST` / `MSSQL_PORT` / `MSSQL_USER` / `MSSQL_PASS` / `MSSQL_DATABASE` (CCPP)
- `MANDRILL_API_KEY` / `SMTP_USER` (Mandrill SMTP)
- `BASECAMP_ACCOUNT_ID`

The container's `BASECAMP_ACCESS_TOKEN` env is often stale (the Basecamp OAuth
token rotates ~biweekly), so the script fetches the **current** token from CCPP
at run time:

```sql
SELECT TOP 1 AccessToken FROM [CCPP].dbo.Basecamp_AuthInfo WHERE IsActive = 1 ORDER BY CreatedDate DESC
```

It falls back to the env token only if that read fails. No secrets live in this
repo or in the script.

## Schedule

`55 7 * * 1-5` with `CRON_TZ=America/Chicago` = **7:55am Central, Monday-Friday**
(DST-safe). Recipients: To `ali@colaberry.com`, Cc `karun@`, `ram@`, `saitejesh@`.

## Run manually

```sh
# test send (to ali only, subject prefixed [TEST])
docker compose -f docker-compose.production.yml exec -T -w /app backend node /app/dailyScrum.js --test

# real send (To ali, Cc the group)
docker compose -f docker-compose.production.yml exec -T -w /app backend node /app/dailyScrum.js
```

## Redeploy after editing dailyScrum.js

```sh
scp scripts/shipces-daily-scrum/dailyScrum.js root@95.216.199.47:/tmp/dailyScrum.js
ssh root@95.216.199.47 "cp /tmp/dailyScrum.js /opt/colaberry-accelerator/cron/dailyScrum.js"
# the cron re-copies the host file into the container on each run, so no container rebuild is needed
```

Logs: `/var/log/shipces-scrum.log` on the VPS.
