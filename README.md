# Oh, hi Atlas!

A welcome party for Atlas and a celebration of Natalie and Duke, from Duke's
team at MET Inventory & more.
Floating 3D lettering, confetti, handwritten notes, photo uploads, paper colors,
stickers, hearts, search, and big love for both parents. Works on phones and desktops.
Respects reduced motion and includes keyboard-friendly dialogs.

The Atlas letters start as flat glyphs and pop into colored foil balloons in a
fresh random order, with uneven 130-260 ms gaps. Each pop swells in 80 ms, then
settles by 320 ms. Their surfaces and normals change shape, not just their scale.
Use the circular replay button for a new shuffle, or click a letter to
reinflate it. Reduced-motion mode shows the finished balloons without animation.

The rounded lettering uses a local Cherry Bomb One glyph subset, licensed under
the SIL Open Font License in `public/balloon-font-OFL.txt`. To regenerate it from
the original font, run `node scripts/convert-balloon-font.mjs /path/to/CherryBombOne-Regular.ttf`.
No font service or extra runtime dependency is needed for the balloon letters.

## Where the love lives

**One server, one site: Docker hosts the website, login, API, and storage.**
Website: https://atlas.aboutvincent.com/
API: https://atlas.aboutvincent.com/api
See [the server runbook](deploy/README.md) for the installed stack and backups.

The Node server serves the built website and stores messages, normalized photos,
and hearts together in SQLite on a persistent Docker volume. No Firebase,
separate API host, or external database account is needed. GitHub stores the
source; its old Pages address only forwards visitors to the server-hosted site.

Messages are not stored only in the visitor's browser. Local storage holds only
unfinished text drafts, a random visitor ID, heart selections, and motion preference.
Photos and posted messages are shared through the server.

## Run locally

Requires Node 24.13 or later and npm.

```sh
npm ci
npm run api
```

In another terminal:

```sh
npm run dev
```

Open the URL printed by Vite, normally http://127.0.0.1:5173/.
The API uses port 8105. Vite forwards `/api` to it.
If a port is occupied, set `PORT` for the API and `API_PROXY_TARGET` for Vite.
Add a changed Vite origin to `SITE_ORIGIN` as well.

For the production build locally:

```sh
npm run build
npm start
```

Open http://localhost:8105/. Do not run a second API on the same port.

## Deploy the storage service

Use a server with Docker Compose and an HTTPS reverse proxy, such as Caddy.
The Mac development setup does not require Docker.

1. Set up the project on your server and create an untracked `.env` using
   `.env.example` as the template.
2. Set `SITE_ORIGIN=https://atlas.aboutvincent.com`. Use your site's origin only.
  Multiple same-site deployment origins can be comma-separated.
3. Set `WRITE_KEY` to a private team invite code. Share it with guests separately.
   Never put it in a `VITE_` variable, URL, GitHub variable, or committed file.
4. Set `TRUST_PROXY=1` when using exactly one reverse proxy in front of the app.
   This makes rate limits apply to visitors, not the whole team as one address.
5. Point the site's domain at the server and run:

```sh
docker compose up -d --build
```

The container listens only on the host's loopback address, port 8105.
Adapt `Caddyfile.example` for a Caddy instance running on the same host.
Caddy handles TLS after DNS points to the server and ports 80/443 are reachable.
If your proxy also runs in Docker, use a shared Docker network and the service
name `atlas:8105`, not `127.0.0.1` inside the proxy container.

Check `https://YOUR-API-DOMAIN/api/health` returns `ok: true`.
The compose configuration requires the origin and invite code, so it cannot
accidentally start in the open local-development mode.

## GitHub and the old link

Source repository: https://github.com/vtemuedra/baby-welcome (public).
The repository remains public as previously approved. Messages, photos, session
cookies, and the invite code are never committed. The `Check Atlas` workflow
validates source changes; updating the Docker server is a separate deployment.

https://vtemuedra.github.io/baby-welcome/ now hosts only a tiny forwarding page
from `deploy/pages-redirect/`. The `Forward old Atlas link` workflow maintains it.
The real application is not built or hosted on GitHub Pages anymore, and does
not use `VITE_API_URL` or `VITE_BASE_PATH`.

## Privacy and care

- **The board and photos require the shared invite code.** Guests enter it once
  on the welcome screen, with no email or account. Access lasts up to 24 hours
  using a host-only HttpOnly cookie, Secure on HTTPS, with SameSite=Strict.
  Sessions survive container restarts; sign-out revokes the current session.
  Changing `WRITE_KEY` invalidates existing sessions. Guests can still save or
  share content, so obtain the family's approval before sharing the invitation.
- Protected API responses and photos use no-store caching. Copies downloaded or
  cached while the old board was public cannot be recalled.
- Ten failed code guesses per IP in 15 minutes trigger a temporary rate limit.
  An expired session returns to the welcome screen; unfinished text is kept on
  the device, but an attached photo must be selected again.
- Photos must be JPG, PNG, or WebP and at most 6 MB. The server validates the
  decoded image, limits dimensions, removes metadata including GPS information,
  and stores a resized WebP. HEIC photos need to be exported as JPG first.
- Notes allow names up to 60 characters and messages up to 1,600 characters.
  Text is rendered as text, never HTML.
- Posting is limited to 12 notes per hour per IP; other writes to 30 per minute.
  This is a small-team guestbook, not a large public social network.
- Guests cannot impersonate an administrator: removal is only available through
  the server's command line. Names on notes are self-entered, not verified identities.
- Hearts are one per browser visitor ID, not one per verified person.
- Fonts are loaded from Google Fonts. The 3D lettering asset is served locally.
- No analytics or tracking pixels are included.

## Backups and removing a note

The data is in the `atlas-data` Docker volume. Rebuilding or restarting the
container keeps it. **Do not run `docker compose down -v`; it deletes the volume.**
The installed server uses `deploy/compose.server.yaml`, so add
`-f deploy/compose.server.yaml` to the compose commands below when running there.
Its automatic snapshot and restore details are in [the server runbook](deploy/README.md).

Create a consistent database backup while the app is running:

```sh
docker compose exec atlas node server/manage.js backup /app/data/backups/atlas-2026-09-09.sqlite
mkdir -p backups
docker compose cp atlas:/app/data/backups/atlas-2026-09-09.sqlite backups/atlas-2026-09-09.sqlite
```

Use a new dated filename each time and keep a copy off the server.
The backup includes notes, photos, and hearts. Treat it as private family data.
For local use: `npm run manage -- backup backups/atlas-2026-09-09.sqlite`.

To remove an unwanted note and its photo:

```sh
docker compose exec atlas node server/manage.js list
docker compose exec atlas node server/manage.js delete NOTE_ID
```

Use the exact ID from the list. Deletion has no undo except a backup.
Existing downloads and browser caches cannot be recalled. Old backups also
retain deleted content until you retire those backups.

To restore, stop the app, preserve the existing volume, and restore the backup
as `atlas.sqlite` in a fresh data directory or volume. Start the app against
that directory. Never mix a restored database with another database's WAL files.

## Checks

```sh
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

API tests cover validation, invite codes, allowed origins, image normalization,
hearts, persistence across restart, backup restore, and note removal.
Browser tests use an isolated temporary database and check actual photo uploads,
a fresh visitor session, failed-save recovery, search, hearts, keyboard focus,
reduced motion, and 3D canvas pixels at 320, 390, 1440, and 1920 px.
Screenshots are written to `test-results`, never committed.
The balloon checks capture the flat, staggered, and inflated states and test
replay, individual-letter clicks, and reduced motion. If port 8106 is occupied,
run the browser tests with `ATLAS_TEST_PORT=8116 npm run test:e2e`.

Node currently labels its built-in SQLite API experimental. The app requires
Node 24 and is tested with that runtime. The lazy-loaded Three.js bundle is
large enough to trigger Vite's default size advisory; it loads separately from
the usable board. The Linux Docker deployment passed its storage tests and a
public HTTPS upload check. That check removed its synthetic note and photo.
