# Atlas Server Runbook

## Live Setup

- Website and login: https://atlas.aboutvincent.com/
- Same-origin API: https://atlas.aboutvincent.com/api
- Old GitHub Pages link: forwarding page only, not a second app deployment.
- Installed project: `~/Docker/baby-welcome` on the Linux Docker server.
- Compose file: `deploy/compose.server.yaml`, project name `baby-welcome`.
- Persistent SQLite database and photos: Docker volume `baby-welcome_atlas-data`.
- Shared proxy network: `docker-network`, Atlas alias `atlas-api`.
- Host port: `127.0.0.1:8105` only. Public traffic goes through Nginx Proxy Manager.

The existing PostgreSQL and MariaDB services were left untouched. Atlas uses
its own SQLite database and does not depend on those apps.

## Proxy and HTTPS

Nginx Proxy Manager routes `atlas.aboutvincent.com` to `http://atlas-api:8105`,
with a dedicated Let's Encrypt certificate. The original API hostname remains
an alternate route to the same container, protected by the same login.
Force SSL and HTTP/2 are enabled. Asset caching is off. Its custom configuration is:

```nginx
client_max_body_size 9m;
```

The API accepts photos up to 6 MB. JSON encoding adds overhead, hence the 9 MB
request limit. On this NPM version the Force SSL and HTTP/2 settings needed to
be saved again after the initial certificate request. Verify the HTTP redirect
after changes, not just the presence of a certificate.

## Private Configuration

The server's `~/Docker/baby-welcome/.env` is private and must never be committed.
It contains the team invite code as `WRITE_KEY`. View or change that code directly
on the server, not through chat or workflow logs. Share it separately with guests.
The welcome page asks for it once. Messages, photos, posting, and hearts all
require a valid session. The server issues a host-only HttpOnly cookie, Secure
over HTTPS, SameSite=Strict, with a 24-hour lifetime. Only a keyed hash of the
random session token is stored in SQLite. Login never returns the token in JSON.
Changing the invite code invalidates existing sessions; sign-out revokes one.

Allowed origins are `https://atlas.aboutvincent.com` and
`https://atlas-api.aboutvincent.com`. `TRUST_PROXY=1` accounts for the single
Nginx proxy between visitors and the app.

Recreate only Atlas after changing its environment:

```sh
cd ~/Docker/baby-welcome
docker compose -f deploy/compose.server.yaml up -d --no-deps --force-recreate --wait atlas
```

## Deploy Updates

Pushing `main` runs source checks, not an application deployment. GitHub Pages
only maintains a redirect for the old address. Copy changed source to the server without
overwriting `.env` or copying runtime data, then rebuild only this stack:

```sh
cd ~/Docker/baby-welcome
docker compose -f deploy/compose.server.yaml up -d --build --wait atlas
curl -fsS https://atlas.aboutvincent.com/api/health
```

The health response should contain `ok: true` and `inviteRequired: true`.
Never run `docker compose down -v`; it removes the stored messages and photos.

## Daily Backups

The user service `atlas-backup.timer` runs daily at 03:30 in the server's time
zone. It is enabled and uses `Persistent=true` to catch a missed run after restart.
`backup-server.sh` creates a consistent SQLite snapshot while Atlas stays running,
then writes a timestamped folder under `~/Docker/backup/atlas/` containing the
database, `.env` copy, compose file, and backup scripts. Files are private to the
server user. This folder is included by the existing server backup process.

The Atlas timer and a successful local snapshot were verified. Remote retention
and the next run of the separate whole-server backup have not been reverified.
Snapshots contain the invite code and family data; do not put them in GitHub.
The Atlas script does not prune old snapshots, so monitor disk space and apply
the server's chosen retention policy.

```sh
systemctl --user status atlas-backup.timer
systemctl --user start atlas-backup.service
journalctl --user -u atlas-backup.service -n 20
```

To restore, stop Atlas, preserve the existing volume, and restore a snapshot's
`atlas.sqlite` into a fresh data volume. Do not mix it with old `-wal` or `-shm`
files. Restore the matching private environment separately, then start Atlas.

## Verification and Removal

The public HTTPS smoke check runs inside the container, keeping `WRITE_KEY`
inside that process. It verifies the login cookie's security flags, creates one
synthetic photo note, checks retrieval and a heart, removes only its own data,
then logs out and checks that access has been revoked:

```sh
cd ~/Docker/baby-welcome
docker compose -f deploy/compose.server.yaml exec -T atlas node --input-type=module < deploy/verify-public.mjs
```

For owner-requested removal, first list notes, then use the exact ID:

```sh
docker compose -f deploy/compose.server.yaml exec -T atlas node server/manage.js list
docker compose -f deploy/compose.server.yaml exec -T atlas node server/manage.js delete NOTE_ID
```

Deletion removes the note, its photo, and its hearts from the live database.
Previously downloaded copies and older backups cannot be recalled automatically.