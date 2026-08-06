# ShipCES daily scrum report

Automated daily stand-up snapshot for the **ShipCES - Autonomous Brokerage**
Basecamp project (id `47126345`). Emails an HTML report each weekday morning so
anyone looking in can see what has been worked on, what is in progress, and what
is coming, broken down by list, with a Gantt-style upcoming view, a birds-eye of
the build layers, milestone anchors, and conditional color (on time vs late).

## Files

- `dailyScrum.js` - the generator + sender. Pulls live Basecamp data, renders the
  HTML email, and sends via Mandrill. Requires `./deliverables.js`. Deps are only
  `nodemailer` + `mssql` (both in the backend image; `mssql` is lazy-required so
  `--preview` runs on a machine without it); `https`/`fs`/`path` are built in.
- `deliverables.js` - the deliverable model (the PM spine): one verifiable
  deliverable + acceptance criterion + value + dependencies + state per work
  stream, plus the pure HTML render helpers. Shared by the email and the Gantt so
  the two never drift. **Must be deployed alongside `dailyScrum.js`.**
- `buildGantt.js` - standalone delivery-Gantt generator (dependency icons on the
  bars, one deliverable + acceptance per bar). Run locally; not part of the cron.
- `shipces-scrum.cron` - the cron definition installed at `/etc/cron.d/shipces-scrum`.

## The report shape (PMBOK + Story-Driven Build)

The email is a PMBOK 8th-edition **work-performance report**. Each of the 9 work
streams is a **deliverable** with an **acceptance criterion** and a state on the
verify-to-accept chain (Verified = tests + tsc green, pending sign-off; Accepted =
client signed off). The birds-eye is the value chain
`Sense -> RMS -> OMS -> TMS -> BMS` with an hourglass on any bar that has an
upstream dependency (a bar cannot land until the one before it does). This
matches Brett's Jul 9 ask: one tangible deliverable per stream + dependency icons
on the bars, doubling as the Thursday demo agenda and his sign-off.

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

## Preview locally (no network, no send)

```sh
node scripts/shipces-daily-scrum/dailyScrum.js --preview   # -> ~/Downloads/ShipCES-Delivery-Report-preview.html
node scripts/shipces-daily-scrum/buildGantt.js             # -> ~/Downloads/ShipCES-Delivery-Gantt-v2.html
```

Preview uses a labeled sample snapshot for ticket counts; deliverables,
acceptance criteria, states and dependencies are real.

## Redeploy after editing

`dailyScrum.js` now requires `deliverables.js`, so **copy both** or the cron run
will crash on `require('./deliverables')`.

```sh
scp scripts/shipces-daily-scrum/dailyScrum.js scripts/shipces-daily-scrum/deliverables.js root@95.216.199.47:/tmp/
ssh root@95.216.199.47 "cp /tmp/dailyScrum.js /tmp/deliverables.js /opt/colaberry-accelerator/cron/"
# the cron re-copies the host files into the container on each run, so no container rebuild is needed
```

Logs: `/var/log/shipces-scrum.log` on the VPS.
