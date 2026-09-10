import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import sharp from 'sharp'

const colors = new Set(['peach', 'blue', 'yellow', 'pink', 'green'])
const stickers = new Set(['heart', 'star', 'flower'])

function matchesKey(value, expected) {
  const supplied = Buffer.from(value || '')
  const secret = Buffer.from(expected)
  return supplied.length === secret.length && timingSafeEqual(supplied, secret)
}

export function createApp({ dataDir, siteOrigin = '', writeKey = '', staticDir, trustProxy = false }) {
  mkdirSync(dataDir, { recursive: true })
  const database = new DatabaseSync(path.join(dataDir, 'atlas.sqlite'))
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL,
      color TEXT NOT NULL, sticker TEXT NOT NULL, created_at TEXT NOT NULL,
      photo BLOB
    );
    CREATE TABLE IF NOT EXISTS hearts (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      visitor_id TEXT NOT NULL, PRIMARY KEY (message_id, visitor_id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
    );
  `)
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', trustProxy)
  app.use(cookieParser())
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  const origins = siteOrigin.split(',').map((origin) => origin.trim()).filter(Boolean)
  app.use('/api', (request, response, next) => {
    const origin = request.get('origin')
    const sameOrigin = origin === `${request.protocol}://${request.get('host')}`
    if (origin && !sameOrigin && !origins.includes(origin)) {
      return response.status(403).json({ error: 'This site is not on the guest list.' })
    }
    if (origin) {
      response.set('Access-Control-Allow-Origin', origin)
      response.vary('Origin')
    }
    response.set('Access-Control-Allow-Headers', 'Content-Type')
    response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.set('Cache-Control', 'no-store')
    if (request.method === 'OPTIONS') return response.sendStatus(204)
    next()
  })
  const sessionHash = (token) => createHmac('sha256', writeKey).update(token).digest('hex')
  const cookieOptions = (request) => ({ httpOnly: true, secure: request.secure, sameSite: 'strict', path: '/api' })
  function sessionToken(request) {
    const token = request.cookies['atlas-session']
    return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : ''
  }
  function authenticated(request) {
    if (!writeKey) return true
    const token = sessionToken(request)
    return Boolean(token && database.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?')
      .get(sessionHash(token), Date.now()))
  }
  function authorize(request, response, next) {
    if (!authenticated(request)) return response.status(401).json({ error: 'Your invitation needs a quick check. Enter the team code to come in.' })
    next()
  }
  const logins = rateLimit({ windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true,
    standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many guesses. Give it 15 minutes, then try again.' } })
  app.get('/api/health', (_request, response) => response.json({ ok: true, inviteRequired: Boolean(writeKey) }))
  app.get('/api/session', (request, response) => response.json({ authenticated: authenticated(request), inviteRequired: Boolean(writeKey) }))
  app.post('/api/session', logins, express.json({ limit: '1kb' }), (request, response) => {
    const code = request.body?.code
    if (typeof code !== 'string' || code.length > 512 || (writeKey && !matchesKey(code, writeKey))) {
      return response.status(401).json({ error: "That code isn't quite right. Try the one from the team." })
    }
    if (!writeKey) return response.json({ authenticated: true })
    database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
    const token = randomBytes(32).toString('hex')
    const expiresAt = Date.now() + 24 * 60 * 60_000
    database.prepare('INSERT INTO sessions VALUES (?, ?)').run(sessionHash(token), expiresAt)
    response.cookie('atlas-session', token, { ...cookieOptions(request), maxAge: 24 * 60 * 60_000 })
    response.json({ authenticated: true, expiresAt })
  })
  app.delete('/api/session', (request, response) => {
    const token = sessionToken(request)
    if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sessionHash(token))
    response.clearCookie('atlas-session', cookieOptions(request))
    response.json({ authenticated: false })
  })
  app.use('/api', authorize, express.json({ limit: '9mb' }))
  const writes = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'A little breather! Try again in a minute.' } })
  const uploads = rateLimit({ windowMs: 3_600_000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'So much love! Try adding another note in an hour.' } })
  const selectMessages = database.prepare(`
    SELECT id, name, body, color, sticker, created_at AS createdAt,
      photo IS NOT NULL AS hasPhoto,
      (SELECT COUNT(*) FROM hearts WHERE message_id = messages.id) AS hearts
    FROM messages ORDER BY created_at DESC, rowid DESC
  `)
  function serialize(row) {
    return { ...row, hasPhoto: Boolean(row.hasPhoto) }
  }
  app.get('/api/messages', (_request, response) => {
    response.json({ messages: selectMessages.all().map(serialize) })
  })
  app.get('/api/photos/:id', (request, response) => {
    const message = database.prepare('SELECT photo FROM messages WHERE id = ?').get(request.params.id)
    if (!message?.photo) return response.status(404).json({ error: 'Photo not found.' })
    response.set('Cache-Control', 'private, no-store')
    response.type('webp').send(Buffer.from(message.photo))
  })
  app.post('/api/messages', writes, uploads, async (request, response, next) => {
    try {
      const { name, body, color, sticker, photo } = request.body || {}
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 ||
          typeof body !== 'string' || !body.trim() || body.trim().length > 1600 ||
          !colors.has(color) || !stickers.has(sticker)) {
        return response.status(400).json({ error: 'Add your name and a note (up to 1,600 characters).' })
      }
      let normalizedPhoto = null
      if (photo !== undefined && photo !== null) {
        if (typeof photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) {
          return response.status(400).json({ error: 'Choose a JPG, PNG, or WebP photo.' })
        }
        const bytes = Buffer.from(photo.slice(photo.indexOf(',') + 1), 'base64')
        if (bytes.length > 6 * 1024 * 1024) {
          return response.status(413).json({ error: 'That photo is a little big. Keep it under 6 MB.' })
        }
        try {
          const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false })
          const metadata = await image.metadata()
          if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Unsupported image')
          normalizedPhoto = await image.rotate().resize(1800, 1800, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 84 }).toBuffer()
        } catch {
          return response.status(400).json({ error: "We couldn't open that photo. Try a JPG, PNG, or WebP." })
        }
      }
      const id = randomUUID()
      const createdAt = new Date().toISOString()
      database.prepare('INSERT INTO messages (id, name, body, color, sticker, created_at, photo) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, name.trim(), body.trim(), color, sticker, createdAt, normalizedPhoto)
      response.status(201).json({ message: { id, name: name.trim(), body: body.trim(), color, sticker,
        createdAt, hasPhoto: Boolean(normalizedPhoto), hearts: 0 } })
    } catch (error) { next(error) }
  })
  app.put('/api/messages/:id/heart', writes, (request, response) => {
    const { visitorId, active } = request.body || {}
    if (typeof visitorId !== 'string' || !/^[a-f0-9-]{36}$/i.test(visitorId) || typeof active !== 'boolean') {
      return response.status(400).json({ error: 'Something went sideways. Refresh and try again.' })
    }
    if (!database.prepare('SELECT id FROM messages WHERE id = ?').get(request.params.id)) {
      return response.status(404).json({ error: 'That note is no longer here.' })
    }
    if (active) database.prepare('INSERT OR IGNORE INTO hearts VALUES (?, ?)').run(request.params.id, visitorId)
    else database.prepare('DELETE FROM hearts WHERE message_id = ? AND visitor_id = ?').run(request.params.id, visitorId)
    const { hearts } = database.prepare('SELECT COUNT(*) AS hearts FROM hearts WHERE message_id = ?').get(request.params.id)
    response.json({ hearts })
  })
  app.use('/api', (_request, response) => response.status(404).json({ error: 'Not found.' }))
  if (staticDir) app.use(express.static(staticDir))
  app.use((error, _request, response, _next) => {
    if (error.type === 'entity.too.large') return response.status(413).json({ error: 'That upload is too big. Choose a photo under 6 MB.' })
    if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'That note could not be read. Try again.' })
    console.error(error)
    response.status(500).json({ error: "Couldn't save just now. Your note is still here; please try again." })
  })
  return { app, close: () => database.close() }
}