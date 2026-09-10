import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'

const [command, source, destination] = process.argv.slice(2)
if (command === 'prepare' && source && destination) {
  const selections = [
    { id: 'together', file: 'Atlas 1.jpeg', caption: 'All the love, right here.', alt: 'Duke and Natalie cuddling newborn Atlas together.' },
    { id: 'player-two', file: 'Atlas 7.jpg', caption: 'Player two has arrived.', alt: 'Duke holding Atlas, both in matching gaming-themed outfits.' },
    { id: 'little-world', file: 'Atlas 8.jpg', caption: 'A whole little world to discover.', alt: 'Duke and Atlas lying together on a play mat, looking at a little cloth book.' },
    { id: 'dream-big', file: 'Atlas 5.jpeg', caption: 'Big stretch. Bigger dreams.', alt: 'Atlas resting on a white blanket with both arms stretched above his head.' },
  ]
  const photos = []
  for (const [position, selection] of selections.entries()) {
    const { data, info } = await sharp(path.join(source, selection.file), { limitInputPixels: 40_000_000 })
      .rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer({ resolveWithObject: true })
    const metadata = await sharp(data).metadata()
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.xmp, undefined)
    photos.push({ id: selection.id, caption: selection.caption, alt: selection.alt, position,
      width: info.width, height: info.height, photo: data.toString('base64') })
    console.log(`${selection.id}: ${info.width} x ${info.height}, ${Math.round(data.length / 1024)} KB; metadata removed`)
  }
  writeFileSync(destination, JSON.stringify({ photos }), { mode: 0o600, flag: 'wx' })
} else if (command === 'import' && source) {
  const { photos } = JSON.parse(readFileSync(source === '-' ? 0 : source, 'utf8'))
  assert(Array.isArray(photos) && photos.length > 0 && photos.length <= 20)
  assert.equal(new Set(photos.map((photo) => photo.id)).size, photos.length)
  const records = []
  for (const photo of photos) {
    assert(typeof photo.id === 'string' && /^[a-z0-9-]{1,60}$/.test(photo.id))
    assert(typeof photo.caption === 'string' && photo.caption.length <= 160)
    assert(typeof photo.alt === 'string' && photo.alt.length <= 300)
    assert(Number.isInteger(photo.position))
    assert(typeof photo.photo === 'string' && photo.photo.length < 8_000_000)
    const data = Buffer.from(photo.photo, 'base64')
    const metadata = await sharp(data, { limitInputPixels: 40_000_000 }).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.xmp, undefined)
    assert.equal(photo.width, metadata.width)
    assert.equal(photo.height, metadata.height)
    records.push({ ...photo, data })
  }
  const database = new DatabaseSync(path.resolve(process.env.DATA_DIR || 'data', 'atlas.sqlite'))
  try {
    database.exec('BEGIN IMMEDIATE')
    const save = database.prepare(`INSERT INTO family_photos (id, caption, alt, position, width, height, photo)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET caption=excluded.caption, alt=excluded.alt,
      position=excluded.position, width=excluded.width, height=excluded.height, photo=excluded.photo`)
    for (const record of records) save.run(record.id, record.caption, record.alt, record.position, record.width, record.height, record.data)
    database.exec('COMMIT')
    console.log(`Imported ${records.length} family photos. Coworkers' notes and login settings were not changed.`)
  } catch (error) {
    if (database.isTransaction) database.exec('ROLLBACK')
    throw error
  } finally { database.close() }
} else {
  throw new Error('Usage: node server/import-family.js prepare SOURCE_FOLDER PRIVATE_BUNDLE.json | import PRIVATE_BUNDLE.json (or - for stdin)')
}