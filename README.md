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

**Live: GitHub Pages for the frontend, your Docker server for storage.**
Website: https://vtemuedra.github.io/baby-welcome/
Storage API: https://atlas-api.aboutvincent.com/api
See [the server runbook](deploy/README.md) for the installed stack and backups.

GitHub Pages serves files; it cannot receive or store visitor uploads by itself.
The small Node API stores messages, normalized photos, and hearts together in
SQLite on a persistent Docker volume. No Firebase or external database account.

You can also host the entire site in the same Docker container on your own domain.
That is simpler if you prefer a single deployment. The Pages setup is optional.

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
2. Set `SITE_ORIGIN=https://vtemuedra.github.io`. This is the origin only,
   not the `/baby-welcome/` path. Multiple origins can be comma-separated.
3. Set `WRITE_KEY` to a private team invite code. Share it with guests separately.
   Never put it in a `VITE_` variable, URL, GitHub variable, or committed file.
4. Set `TRUST_PROXY=1` when using exactly one reverse proxy in front of the app.
   This makes rate limits apply to visitors, not the whole team as one address.
5. Point an API subdomain at the server and run:

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

## Publish to vtemuedra's GitHub Pages

Source repository: https://github.com/vtemuedra/baby-welcome (public).
GitHub Pages and the Docker storage service are deployed. The repository was
made public with the owner's approval because the current GitHub plan does not
support Pages for a private repository. Stored uploads and secrets remain on
the server, not in GitHub.

The current Pages configuration is:
- `VITE_API_URL=https://atlas-api.aboutvincent.com/api`
- `VITE_BASE_PATH=/baby-welcome/`

To reproduce the setup:

1. Deploy the Docker storage service and verify its HTTPS endpoint first.
  Data, environment secrets, backups, and test artifacts stay out of GitHub.
2. In repository **Settings > Pages**, select **GitHub Actions** as the source.
3. Under **Settings > Secrets and variables > Actions > Variables**, set
   `VITE_API_URL` to `https://YOUR-API-DOMAIN/api`.
4. The workflow defaults to `/baby-welcome/`. For a different repository name,
   set the `VITE_BASE_PATH` variable to `/<repository-name>/`.
   For a custom Pages domain, set it to `/` and configure the domain in Pages.
5. Run **Publish Atlas to GitHub Pages** or push to `main`.

Live site URL: https://vtemuedra.github.io/baby-welcome/.
Pages hosting from a private repository requires an eligible GitHub plan.
A private source repository does not make a standard Pages site private.
The all-in-one Docker option below does not require Pages or a paid GitHub plan.
The workflow skips deployment while the API URL is unset and rejects non-HTTPS URLs.
No GitHub access token or private invite code belongs in the browser bundle.

For an all-in-one Docker deployment, use your site domain in `SITE_ORIGIN`,
proxy that domain to port 8105, and leave all `VITE_` variables unset.
No GitHub Pages deployment is needed in that case.

## Privacy and care

- **The board and photos are public.** The invite code protects posting and
  hearts, not viewing. Obtain the family's approval before sharing the link.
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
