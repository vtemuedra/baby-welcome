import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'

const base = new URL(process.env.ATLAS_PUBLIC_API || 'https://atlas.aboutvincent.com/api')
assert.equal(base.protocol, 'https:')
assert(process.env.WRITE_KEY, 'Run inside the Atlas container with its existing invite configuration.')
const probeName = `Deployment check ${randomUUID()}`
const database = new DatabaseSync(path.join(process.env.DATA_DIR || '/app/data', 'atlas.sqlite'), { open: true })
database.exec('PRAGMA foreign_keys = ON')
const origin = base.origin
const headers = { 'Content-Type': 'application/json', Origin: origin }
const request = (route, options = {}) => fetch(`${base.href.replace(/\/$/, '')}${route}`, {
  ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(30_000),
})
let messageId
try {
  const health = await request('/health')
  assert.equal(health.status, 200)
  assert.equal((await health.json()).inviteRequired, true)
  assert.equal((await request('/messages')).status, 401)
  const session = await request('/session', { method: 'POST', body: JSON.stringify({ code: process.env.WRITE_KEY }) })
  assert.equal(session.status, 200)
  const cookie = session.headers.get('set-cookie')
  assert(cookie.includes('HttpOnly') && cookie.includes('Secure') && cookie.includes('SameSite=Strict'))
  assert.equal((await session.json()).token, undefined)
  headers.Cookie = cookie.split(';')[0]
  const image = await sharp(randomBytes(800 * 800 * 3), { raw: { width: 800, height: 800, channels: 3 } }).png().toBuffer()
  assert(image.length > 1024 * 1024)
  const result = await request('/messages', { method: 'POST', headers, body: JSON.stringify({
    name: probeName, body: 'Temporary synthetic deployment check. Removed automatically.',
    color: 'blue', sticker: 'star', photo: `data:image/png;base64,${image.toString('base64')}`,
  }) })
  assert.equal(result.status, 201, 'Photo upload must reach the protected API through HTTPS.')
  const { message } = await result.json()
  messageId = message.id
  assert.equal(message.hasPhoto, true)
  const listing = await request('/messages', { headers: { Origin: origin } })
  assert.equal(listing.headers.get('access-control-allow-origin'), origin)
  assert((await listing.json()).messages.some((note) => note.id === messageId))
  const photo = await request(`/photos/${messageId}`)
  assert.equal(photo.status, 200)
  assert.equal(photo.headers.get('content-type'), 'image/webp')
  const metadata = await sharp(Buffer.from(await photo.arrayBuffer())).metadata()
  assert.equal(metadata.width, 800)
  assert.equal(metadata.format, 'webp')
  const heart = await request(`/messages/${messageId}/heart`, {
    method: 'PUT', headers, body: JSON.stringify({ visitorId: randomUUID(), active: true }),
  })
  assert.equal(heart.status, 200)
  assert.equal((await heart.json()).hearts, 1)
  console.log('PASS: same-site HTTPS login, secure HttpOnly cookie, protected upload above 1 MB, photo retrieval, and hearts.')
} finally {
  const removed = database.prepare('DELETE FROM messages WHERE name = ?').run(probeName)
  database.close()
  console.log(`Removed ${removed.changes} synthetic note(s), including photo and hearts. Invite code was not printed.`)
  if (headers.Cookie) {
    await request('/session', { method: 'DELETE' })
    assert.equal((await request('/messages')).status, 401)
  }
}
if (messageId) assert.equal((await request(`/photos/${messageId}`)).status, 401)