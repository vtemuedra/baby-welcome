import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { app, close } = createApp({
  dataDir: process.env.DATA_DIR || path.join(root, 'data'),
  siteOrigin: process.env.SITE_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173',
  writeKey: process.env.WRITE_KEY || '',
  staticDir: path.join(root, 'dist'),
  trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false,
})
const port = Number(process.env.PORT || 8105)
const server = app.listen(port, '0.0.0.0', (error) => {
  if (error) {
    console.error(`Could not start on port ${port}: ${error.message}`)
    close()
    process.exit(1)
  }
  console.log(`Atlas's welcome party: http://localhost:${port}`)
})
function shutdown() {
  server.close(() => { close(); process.exit(0) })
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)