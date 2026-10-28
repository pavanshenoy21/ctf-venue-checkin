# CTF venue check-in (v1, Next.js + TypeScript)

Import a participant CSV, assign every team to one of two halls (DTH / ISE Seminar Hall), confirm,
send each participant an email with their own QR code, and check people in at the hall they were
assigned to. Built for the Voyage to Ithaca CTF; the event name, hall capacities and "no team"
markers are configuration.

One Next.js app (pages and API) plus PostgreSQL. Raw parameterised SQL with the `pg` driver, no ORM.

## How it works

1. **Import** (super admin, Setup page or CLI). The CSV needs a header row with team, name and email
   columns; other columns are optional and extra ones are ignored. A blank team cell or a value such
   as `(No team)` means the person has no team. Errors (a team over 3, a duplicate or missing email,
   malformed rows) block the import; warnings (a duplicate SAP ID, a declared size that differs from
   the rows) don't.
2. **Assign venues.** ISE (113 seats) is filled with as many 3-member teams as fit, then 2-member,
   then 1-member teams. Everyone else goes to DTH (145). Teams are never split, and people without a
   team always go to DTH. The same CSV always gives the same result. If everyone can't fit, nothing
   is assigned and the conflicting teams are listed.
3. **Confirm.** Venues become final. From this point, check-in opens and QR codes and emails are available.
4. **QR codes and emails.** Each person's QR holds only `PUBLIC_BASE_URL/checkin/<random code>`
   (192 random bits, no name or venue). Opening it shows their venue; that is not a check-in.
   Emails can go out directly over SMTP (QR attached inline) or as a mail-merge CSV.
5. **Event day.** Operators sign in at the DTH or ISE desk on a phone, tablet or laptop and scan.
   The venue always comes from the operator's account, so a DTH desk can never check in an ISE
   participant, even with an edited request. Results: success, already checked in (original time),
   wrong venue, invalid code. Each person can be checked in once.
6. **Follow and export.** The Attendance page shows live numbers by venue and by team size
   (all present, partly here, not arrived). Check-ins and the full participant list export as CSV.

| Role | Signs in to | Can |
|---|---|---|
| Super admin | `/admin` | Everything except scanning |
| DTH operator | `/admin/dth` | Scan and check in DTH participants |
| ISE operator | `/admin/ise` | Scan and check in ISE participants |
| Participant | `/checkin/<code>` (their QR) | See their own venue and team |

## Deploy with Docker

Requirements: a Linux server with Docker and the Compose plugin, and a host name that participants'
phones can reach. **Phone cameras only work on HTTPS pages**, so the app must be served over HTTPS.

```bash
cp .env.example .env
#   POSTGRES_PASSWORD   openssl rand -hex 24
#   PUBLIC_BASE_URL     https://ctf.example.edu   (baked into every QR code and email)
#   DOMAIN              ctf.example.edu           (only for the bundled Caddy)
```

Choose one way to serve HTTPS:

- **Bundled Caddy** (simplest: ports 80 and 443 must be free and the name must resolve to this
  server; Caddy gets a Let's Encrypt certificate automatically):
  ```bash
  docker compose --profile https up -d --build
  ```
- **Your own reverse proxy** (nginx, Traefik, an existing Caddy, a Cloudflare tunnel): run
  `docker compose up -d --build` and point the proxy at `http://127.0.0.1:3000`. The proxy must append
  the client address to `X-Forwarded-For` (all of the above do). Set `PROXY_HOPS` to the number of
  proxies in front of the app (Cloudflare in front of Caddy = 2).

The app container listens on 127.0.0.1 only, and the database has no published port. The app
applies its SQL migrations at start-up. Data lives in the `pgdata` volume and survives
`restart`, `down` and `up`; only `docker compose down -v` deletes it.

## Commands

All CLI commands run inside the app container (`docker compose exec app node cli.cjs ...`).

```bash
# 1. accounts (password from an env var, at least 10 characters; re-running changes the password
#    and signs that user out everywhere)
docker compose exec -e PW='…' app node cli.cjs create-admin --username root --role SUPER_ADMIN --password-env PW
docker compose exec -e PW='…' app node cli.cjs create-admin --username dth  --role VENUE_OPERATOR --venue DTH --password-env PW
docker compose exec -e PW='…' app node cli.cjs create-admin --username ise  --role VENUE_OPERATOR --venue ISE --password-env PW

# 2-4. import, assign, confirm. The Setup page in the browser does the same; for the CLI, put the CSV
#      in ./data (mounted read-only at /data)
docker compose exec app node cli.cjs import-csv /data/participants.csv --dry-run
docker compose exec app node cli.cjs import-csv /data/participants.csv
docker compose exec app node cli.cjs allocate
docker compose exec app node cli.cjs confirm
```

5. **QR codes:** `/admin/qr-codes` → *Generate all QR codes (ZIP)* (PNG per person, named
   `Name_Team_VENUE.png`; print a set as a fallback) and *Export list (CSV)*.
6. **Emails:** `/admin/emails`. Set the `SMTP_*` values in `.env`, run `docker compose up -d` again,
   *Send test* to your own address, check it on a phone, then *Send to N unsent*. Failed addresses are
   retried the next time you send to unsent participants. Without SMTP, use *Export for mail merge (CSV)*.
7. **Desks:** operators open `/admin/dth` or `/admin/ise`, sign in, and tap *SCAN QR*. The result
   screens return to the camera by themselves; a manual-entry box is the fallback.
8. **Export:** `/admin/checkins` → *Export check-ins* and *Export full participant list*.

## Backup and restore

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U ctf -d ctf -Fc > backups/ctf_$(date +%F_%H%M).dump

# restore (stops the app, empties the database, loads the dump)
docker compose stop app
docker compose exec -T db psql -U ctf -d ctf -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public'
docker compose exec -T db pg_restore -U ctf -d ctf --no-owner < backups/ctf_FILE.dump
docker compose start app
```

Take one right after confirming venues and regularly on event day (for example every 15 minutes
from cron), and keep copies off the server.

## Security

| Risk | Defence |
|---|---|
| Checking someone in at the wrong hall | The venue comes only from the operator's session; request fields are ignored. A database trigger also rejects a check-in whose venue differs from the participant's. |
| Split teams, or venues changed after confirmation | Database triggers: team members must match their team (checked at commit); after confirmation, venues can't change, participants and teams can't be deleted and confirmation can't be undone. |
| Duplicate check-ins under load | `UNIQUE(participant_id)` plus a row lock: simultaneous scans give one success. Check-ins are append-only. |
| Guessing QR codes | 192-bit random codes; after 30 failed lookups a minute an address is refused for every code, valid or not, so it learns nothing. |
| Password guessing and lock-out abuse | scrypt hashes; limits per address and per address + username (no per-username limit anyone could use to lock an operator out). |
| Spoofed client addresses | `X-Forwarded-For` is used only behind the proxy (`TRUST_PROXY=true`), and only the entry the proxy appended. |
| XSS, clickjacking | Per-request CSP nonce on every script, `frame-ancestors 'none'`, HTML escaping in emails, React escaping elsewhere. |
| CSRF | HttpOnly, SameSite=Strict, Secure session cookie plus a required custom header on every change. |
| Leaked logs or exports | URLs (which contain QR codes) are never logged; spreadsheet formula injection is neutralised in CSV exports. |
| Container compromise | Non-root user, read-only filesystem, all Linux capabilities dropped, `no-new-privileges`. |

Known limits: rate limiting is in memory, so run **one** app container. A QR code works for whoever
holds it, so desk operators should compare the name on screen with the person's ID.

## Configuration

Every setting comes from `.env`; see `.env.example`, which documents each one. The ones that matter
most: `POSTGRES_PASSWORD`, `PUBLIC_BASE_URL`, `DOMAIN`, `COOKIE_SECURE` (keep `true` except on plain
`http://localhost`), `PROXY_HOPS`, the hall capacities, `NO_TEAM_MARKERS` and the `SMTP_*` values.

## Development and tests

Needs Node 22 and a PostgreSQL to test against (tests wipe their database, and refuse to run unless
its name contains "test").

```bash
npm ci
npm run dev                        # http://localhost:3000  (DATABASE_URL, COOKIE_SECURE=false)
npm run cli -- seed-demo           # 171 demo people with @example.invalid emails (refuses if data exists)
npm test                           # unit + integration tests (Vitest, real Postgres): TEST_DATABASE_URL
npm run test:e2e                   # browser tests (Playwright) against the production build:
                                   # E2E_DATABASE_URL, starts its own server and a local SMTP server
npm run typecheck
```

- `tests/unit`: allocation (including a brute-force cross-check), CSV parsing, passwords and tokens,
  QR images, exports, email content, HTTP helpers, rate limits, security headers.
- `tests/db`: every database constraint and trigger.
- `tests/integration`: every API route, the DTH/ISE accept/reject matrix, tampered requests,
  simultaneous scans, real email delivery, the CLI, and a full event run through the API.
- `e2e`: each feature in a real browser, including the camera scanner fed by a fake webcam, and
  checks that no page triggers a CSP violation or a script error.
