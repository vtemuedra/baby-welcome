import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from './app.js'

const dataDir = mkdtempSync(path.join(tmpdir(), 'atlas-browser-test-'))
const { app, close } = createApp({ dataDir, staticDir: path.resolve('dist') })
const protectedApp = createApp({ dataDir: path.join(dataDir, 'protected'), staticDir: path.resolve('dist'), writeKey: 'browser-test-invite' })
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