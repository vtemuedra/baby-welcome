import { mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import { createApp } from './app.js'

const dataDir = mkdtempSync(path.join(tmpdir(), 'atlas-browser-test-'))
const { app, close } = createApp({ dataDir, staticDir: path.resolve('dist') })
const protectedApp = createApp({ dataDir: path.join(dataDir, 'protected'), staticDir: path.resolve('dist'), writeKey: 'browser-test-invite' })
if (process.env.ATLAS_FAMILY_BUNDLE) {
  execFileSync(process.execPath, ['server/import-family.js', 'import', process.env.ATLAS_FAMILY_BUNDLE], { env: { ...process.env, DATA_DIR: path.join(dataDir, 'protected') } })
} else {
  const album = new DatabaseSync(path.join(dataDir, 'protected', 'atlas.sqlite'))
  for (const [position, id] of ['together', 'player-two', 'little-world', 'dream-big'].entries()) {
    const width = position === 1 ? 300 : 400
    const height = position === 1 ? 400 : 300
    const photo = await sharp({ create: { width, height, channels: 3, background: ['#efd6cc', '#dde6cd', '#d1e3f0', '#f2dd9f'][position] } }).webp().toBuffer()
    album.prepare('INSERT INTO family_photos VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, `Family moment ${position + 1}`, `Album test photo ${position + 1}`, position, width, height, photo)
  }
  album.close()
}
const protectedServer = protectedApp.app.listen(Number(process.env.ATLAS_TEST_PORT || 8106) + 1, '127.0.0.1', (error) => {
  if (error) { console.error(error); process.exit(1) }
})
const server = app.listen(Number(process.env.ATLAS_TEST_PORT || 8106), '127.0.0.1', (error) => {
  if (error) { console.error(error); close(); rmSync(dataDir, { recursive: true, force: true }); process.exit(1) }
})
function shutdown() {
  server.close(() => {
    protectedServer.close(() => { close(); protectedApp.close(); rmSync(dataDir, { recursive: true, force: true }); process.exit(0) })
  })
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)