import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { createApp } from './app.js'

test('shared notes, normalized photos, hearts, validation, and restart persistence', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'atlas-test-'))
  let instance
  let server
  let base
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
  function post(body, key = 'test-invite') {
    return fetch(`${base}/api/messages`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Invite-Key': key }, body: JSON.stringify(body) })
  }
  const note = { name: 'The team', body: 'Hey Atlas!', color: 'peach', sticker: 'heart' }
  try {
    await start()
    assert.equal((await post(note, '')).status, 401)
    assert.equal((await post({ ...note, body: ' ' })).status, 400)
    assert.equal((await post({ ...note, name: 'x'.repeat(61) })).status, 400)
    assert.equal((await post({ ...note, photo: 'data:image/png;base64,bm90YW5pbWFnZQ==' })).status, 400)
    assert.equal((await post({ ...note, photo: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 400)
    assert.equal((await fetch(`${base}/api/messages`, { headers: { Origin: 'https://other.example' } })).status, 403)
    const cors = await fetch(`${base}/api/messages`, { headers: { Origin: 'https://vtemuedra.github.io' } })
    assert.equal(cors.headers.get('access-control-allow-origin'), 'https://vtemuedra.github.io')
    const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ee6655' } }).png().toBuffer()
    const result = await post({ ...note, photo: `data:image/png;base64,${image.toString('base64')}` })
    assert.equal(result.status, 201)
    const { message } = await result.json()
    assert.equal(message.hasPhoto, true)
    const visitorId = randomUUID()
    const heart = () => fetch(`${base}/api/messages/${message.id}/heart`, { method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Invite-Key': 'test-invite' }, body: JSON.stringify({ visitorId, active: true }) })
    assert.equal((await (await heart()).json()).hearts, 1)
    assert.equal((await (await heart()).json()).hearts, 1)
    await stop()
    await start()
    const messages = await (await fetch(`${base}/api/messages`)).json()
    assert.equal(messages.messages[0].body, 'Hey Atlas!')
    assert.equal(messages.messages[0].hearts, 1)
    const photo = await fetch(`${base}/api/photos/${message.id}`)
    assert.equal(photo.headers.get('content-type'), 'image/webp')
    const metadata = await sharp(Buffer.from(await photo.arrayBuffer())).metadata()
    assert.equal(metadata.width, 10)
    assert.equal(metadata.format, 'webp')
    assert.equal((await fetch(`${base}/api/photos/missing`)).status, 404)
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
    assert.equal((await fetch(`${base}/api/photos/${message.id}`)).status, 404)
    assert.equal((await (await fetch(`${base}/api/messages`)).json()).messages.length, 1)
  } finally {
    if (server?.listening) await stop()
    await rm(dataDir, { recursive: true, force: true })
  }
})