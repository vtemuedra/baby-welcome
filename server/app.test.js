import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { createApp } from './app.js'

test('shared notes, normalized photos, hearts, validation, and restart persistence', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'atlas-test-'))
  let instance
  let server
  let base
  let token = ''
  async function start() {
    instance = createApp({ dataDir, siteOrigin: 'https://vtemuedra.github.io', writeKey: 'test-invite' })
    server = instance.app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  }
  async function stop() {
    await new Promise((resolve) => server.close(resolve))
    instance.close()
  }
  const headers = () => ({ Cookie: `atlas-session=${token}` })
  function get(route) { return fetch(`${base}/api${route}`, { headers: headers() }) }
  function post(body, session = token) {
    return fetch(`${base}/api/messages`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `atlas-session=${session}` }, body: JSON.stringify(body) })
  }
  const note = { name: 'The team', body: 'Hey Atlas!', color: 'peach', sticker: 'heart' }
  try {
    await start()
    assert.equal((await post(note, '')).status, 401)
    assert.equal((await fetch(`${base}/api/messages`)).status, 401)
    assert.equal((await fetch(`${base}/api/photos/missing`)).status, 401)
    const login = (code) => fetch(`${base}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
    assert.equal((await login('wrong')).status, 401)
    const sessionResponse = await login('test-invite')
    const cookie = sessionResponse.headers.get('set-cookie')
    assert(cookie.includes('HttpOnly'))
    assert(cookie.includes('SameSite=Strict'))
    assert(cookie.includes('Path=/api'))
    const session = await sessionResponse.json()
    assert.equal(session.token, undefined)
    token = cookie.match(/atlas-session=([a-f0-9]{64})/)[1]
    assert.match(token, /^[a-f0-9]{64}$/)
    assert.equal((await (await get('/session')).json()).authenticated, true)
    assert.equal((await post({ ...note, body: ' ' })).status, 400)
    assert.equal((await post({ ...note, name: 'x'.repeat(61) })).status, 400)
    assert.equal((await post({ ...note, photo: 'data:image/png;base64,bm90YW5pbWFnZQ==' })).status, 400)
    assert.equal((await post({ ...note, photo: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 400)
    assert.equal((await fetch(`${base}/api/messages`, { headers: { Origin: 'https://other.example' } })).status, 403)
    const cors = await fetch(`${base}/api/messages`, { headers: { ...headers(), Origin: 'https://vtemuedra.github.io' } })
    assert.equal(cors.status, 200)
    assert.equal(cors.headers.get('access-control-allow-origin'), 'https://vtemuedra.github.io')
    const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ee6655' } }).png().toBuffer()
    const result = await post({ ...note, photo: `data:image/png;base64,${image.toString('base64')}` })
    assert.equal(result.status, 201)
    const { message } = await result.json()
    assert.equal(message.hasPhoto, true)
    const visitorId = randomUUID()
    const heart = () => fetch(`${base}/api/messages/${message.id}/heart`, { method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ visitorId, active: true }) })
    assert.equal((await (await heart()).json()).hearts, 1)
    assert.equal((await (await heart()).json()).hearts, 1)
    await stop()
    await start()
    const messages = await (await get('/messages')).json()
    assert.equal(messages.messages[0].body, 'Hey Atlas!')
    assert.equal(messages.messages[0].hearts, 1)
    assert.equal((await fetch(`${base}/api/photos/${message.id}`)).status, 401)
    assert.equal((await fetch(`${base}/api/photos/${message.id}?token=${token}`)).status, 401)
    const photo = await get(`/photos/${message.id}`)
    assert.equal(photo.headers.get('cache-control'), 'private, no-store')
    assert.equal(photo.headers.get('content-type'), 'image/webp')
    const metadata = await sharp(Buffer.from(await photo.arrayBuffer())).metadata()
    assert.equal(metadata.width, 10)
    assert.equal(metadata.format, 'webp')
    assert.equal((await get('/photos/missing')).status, 404)
    assert.equal((await post(note)).status, 201)
    const manage = (...argumentsList) => promisify(execFile)(process.execPath, ['server/manage.js', ...argumentsList], { env: { ...process.env, DATA_DIR: dataDir } })
    const listing = await manage('list')
    assert.equal(JSON.parse(listing.stdout).length, 2)
    const destination = path.join(dataDir, 'backup', 'atlas.sqlite')
    await manage('backup', destination)
    const restored = createApp({ dataDir: path.dirname(destination) })
    const restoredServer = restored.app.listen(0, '127.0.0.1')
    await new Promise((resolve) => restoredServer.once('listening', resolve))
    try {
      const restoredBase = `http://127.0.0.1:${restoredServer.address().port}`
      const restoredNotes = await (await fetch(`${restoredBase}/api/messages`)).json()
      assert.equal(restoredNotes.messages.length, 2)
      assert.equal((await fetch(`${restoredBase}/api/photos/${message.id}`)).status, 200)
    } finally {
      await new Promise((resolve) => restoredServer.close(resolve))
      restored.close()
    }
    await manage('delete', message.id)
    assert.equal((await get(`/photos/${message.id}`)).status, 404)
    assert.equal((await (await get('/messages')).json()).messages.length, 1)
    await fetch(`${base}/api/session`, { method: 'DELETE', headers: headers() })
    assert.equal((await get('/messages')).status, 401)
    token = (await login('test-invite')).headers.get('set-cookie').match(/atlas-session=([a-f0-9]{64})/)[1]
    const inspection = new DatabaseSync(path.join(dataDir, 'atlas.sqlite'))
    const stored = inspection.prepare('SELECT token_hash FROM sessions').get()
    assert.notEqual(stored.token_hash, token)
    inspection.prepare('UPDATE sessions SET expires_at = 0').run()
    inspection.close()
    assert.equal((await get('/messages')).status, 401)
    for (let attempt = 0; attempt < 10; attempt++) assert.equal((await login('wrong')).status, 401)
    assert.equal((await login('wrong')).status, 429)
  } finally {
    if (server?.listening) await stop()
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('family album is private, separate from notes, and survives restart and backup', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'atlas-family-'))
  let instance
  let server
  let base
  let cookie
  async function start() {
    instance = createApp({ dataDir, writeKey: 'family-test' })
    server = instance.app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${server.address().port}/api`
  }
  async function stop() {
    await new Promise((resolve) => server.close(resolve))
    instance.close()
  }
  try {
    await start()
    const photo = await sharp({ create: { width: 20, height: 15, channels: 3, background: '#efb5cb' } }).webp().toBuffer()
    const database = new DatabaseSync(path.join(dataDir, 'atlas.sqlite'))
    database.prepare('INSERT INTO family_photos VALUES (?, ?, ?, ?, ?, ?, ?)').run('together', 'All the love.', 'The family together', 0, 20, 15, photo)
    database.close()
    assert.equal((await fetch(`${base}/family`)).status, 401)
    assert.equal((await fetch(`${base}/family/together/photo`)).status, 401)
    const login = await fetch(`${base}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'family-test' }) })
    cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
    const get = (route) => fetch(`${base}${route}`, { headers: { Cookie: cookie } })
    const album = await (await get('/family')).json()
    assert.equal(album.photos.length, 1)
    assert.equal(album.photos[0].photo, undefined)
    assert.equal((await (await get('/messages')).json()).messages.length, 0)
    assert.equal((await get('/family/missing/photo')).status, 404)
    await stop()
    await start()
    const image = await get('/family/together/photo')
    assert.equal(image.headers.get('cache-control'), 'private, no-store')
    assert.equal(image.headers.get('content-type'), 'image/webp')
    assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).width, 20)
    const backupPath = path.join(dataDir, 'backup.sqlite')
    await promisify(execFile)(process.execPath, ['server/manage.js', 'backup', backupPath], { env: { ...process.env, DATA_DIR: dataDir } })
    const backup = new DatabaseSync(backupPath)
    assert.equal(backup.prepare('SELECT COUNT(*) AS total FROM family_photos').get().total, 1)
    backup.close()
  } finally {
    if (server?.listening) await stop()
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('only the posting browser can delete; ownership survives login and key changes; legacy notes stay unclaimed', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'atlas-owner-'))
  const legacy = new DatabaseSync(path.join(dataDir, 'atlas.sqlite'))
  legacy.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL,
    color TEXT NOT NULL, sticker TEXT NOT NULL, created_at TEXT NOT NULL, photo BLOB);
    INSERT INTO messages VALUES ('legacy', 'Same name', 'An existing note', 'blue', 'star', '2026-09-10', NULL);`)
  legacy.close()
  let instance
  let server
  let base
  async function start(key) {
    instance = createApp({ dataDir, writeKey: key, trustProxy: 1 })
    server = instance.app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${server.address().port}/api`
  }
  async function stop() {
    await new Promise((resolve) => server.close(resolve))
    instance.close()
  }
  function guest() {
    const cookies = new Map()
    return {
      cookies,
      async request(route, method = 'GET', body) {
        const response = await fetch(`${base}${route}`, { method,
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') },
          body: body === undefined ? undefined : JSON.stringify(body) })
        response.headers.getSetCookie().forEach((cookie) => {
          const [name, value] = cookie.split(';')[0].split('=')
          cookies.set(name, value)
        })
        return response
      },
    }
  }
  const owner = guest()
  const other = guest()
  try {
    await start('first-code')
    const login = await owner.request('/session', 'POST', { code: 'first-code' })
    const ownerCookie = login.headers.getSetCookie().find((cookie) => cookie.startsWith('atlas-owner='))
    assert(ownerCookie.includes('HttpOnly') && ownerCookie.includes('Secure') && ownerCookie.includes('SameSite=Strict'))
    const originalOwner = owner.cookies.get('atlas-owner')
    await other.request('/session', 'POST', { code: 'first-code' })
    const image = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#f1c84e' } }).png().toBuffer()
    const note = { name: 'Same name', body: 'My note', color: 'blue', sticker: 'heart', photo: `data:image/png;base64,${image.toString('base64')}` }
    const { message } = await (await owner.request('/messages', 'POST', note)).json()
    assert.equal(message.canDelete, true)
    assert.equal(message.owner_hash, undefined)
    await other.request('/messages', 'POST', { ...note, owner_hash: 'forged', visitorId: originalOwner })
    const owned = (await (await owner.request('/messages')).json()).messages.find((item) => item.id === message.id)
    assert.equal(owned.canDelete, true)
    const others = (await (await other.request('/messages')).json()).messages
    assert.equal(others.find((item) => item.id === message.id).canDelete, false)
    assert.equal(others.find((item) => item.id === 'legacy').canDelete, false)
    assert.equal((await other.request(`/messages/${message.id}`, 'DELETE', { owner: originalOwner, name: 'Same name' })).status, 403)
    assert.equal((await owner.request('/messages/legacy', 'DELETE')).status, 403)
    assert.equal((await owner.request('/messages/missing', 'DELETE')).status, 404)
    await other.request(`/messages/${message.id}/heart`, 'PUT', { visitorId: randomUUID(), active: true })
    await owner.request('/session', 'DELETE')
    assert.equal((await owner.request(`/messages/${message.id}`, 'DELETE')).status, 401)
    await stop()
    await start('new-code')
    assert.equal((await other.request('/messages')).status, 401)
    await owner.request('/session', 'POST', { code: 'new-code' })
    assert.equal(owner.cookies.get('atlas-owner'), originalOwner)
    assert.equal((await (await owner.request('/messages')).json()).messages.find((item) => item.id === message.id).canDelete, true)
    const withoutOwner = guest()
    withoutOwner.cookies.set('atlas-session', owner.cookies.get('atlas-session'))
    assert.equal((await withoutOwner.request(`/messages/${message.id}`, 'DELETE')).status, 403)
    assert.equal((await owner.request(`/messages/${message.id}`, 'DELETE')).status, 200)
    assert.equal((await owner.request(`/photos/${message.id}`)).status, 404)
    const inspection = new DatabaseSync(path.join(dataDir, 'atlas.sqlite'))
    assert.equal(inspection.prepare('SELECT COUNT(*) AS total FROM hearts WHERE message_id = ?').get(message.id).total, 0)
    assert.equal(inspection.prepare("SELECT body FROM messages WHERE id = 'legacy'").get().body, 'An existing note')
    inspection.close()
    const remaining = (await (await owner.request('/messages')).json()).messages
    assert.equal(remaining.length, 2)
    assert(remaining.every((item) => !item.canDelete))
  } finally {
    if (server?.listening) await stop()
    await rm(dataDir, { recursive: true, force: true })
  }
})