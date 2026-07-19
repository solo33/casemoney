# CaseMoney on Selectel

The Selectel deployment keeps shared infrastructure under `/srv/solo32/platform`
and application secrets under `/srv/solo32/secrets`. The repository is cloned to
`/srv/solo32/apps/casemoney`.

## First test deployment

1. Copy `.env.example` to `.env` and generate a database password.
2. Copy `casemoney.env.example` to `/srv/solo32/secrets/casemoney.env` and generate
   a strong `SECRET_KEY`.
3. Keep `CASEMONEY_SITE_ADDRESS=:80` until the application and migrated database
   have been verified by the server IP.
4. Run `docker compose -f deploy/selectel/compose.yml up -d --build`.

PostgreSQL is not published on a host port. Database migration and maintenance
must run locally on the server or through an SSH tunnel over Tailscale.

The manual `Export encrypted Amvera database` GitHub Actions workflow can create
a one-day encrypted migration artifact without exposing the Amvera connection
string or a plaintext database dump. It requires only the repository secret
`AMVERA_DATABASE_URL`. The committed age recipient is a public key; its private
key remains at `/srv/solo32/secrets/amvera-export.agekey` on Selectel.
The encrypted bundle also contains the exact source table list and row counts
used to verify the restored Selectel database.

## PostgreSQL backups

`backup-postgres.sh` creates compressed custom-format dumps for the `casemoney`
and `toppulse` databases, writes SHA-256 checksums, and keeps 14 days by default.
Install it as `/usr/local/sbin/solo32-postgres-backup`, install the matching
service and timer from `systemd/`, then enable `solo32-postgres-backup.timer`.
At least once after setup, restore a dump into a temporary database and compare
critical row counts; a backup is not considered verified until restore succeeds.

## Domain cutover

After verification, set `CASEMONEY_SITE_ADDRESS=casemoney.ru`, update `APP_URL`
and `CORS_ORIGINS` to HTTPS, point DNS to the Selectel public IP, and recreate the
Caddy and CaseMoney containers. Caddy obtains and renews the TLS certificate.
