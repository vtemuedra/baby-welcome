import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync, backup } from 'node:sqlite'

const [command, argument] = process.argv.slice(2)
const databasePath = path.resolve(process.env.DATA_DIR || 'data', 'atlas.sqlite')
if (!existsSync(databasePath)) throw new Error('No board database found. Check DATA_DIR.')
const database = new DatabaseSync(databasePath)
database.exec('PRAGMA foreign_keys = ON')
try {
  if (command === 'list') {
    console.log(JSON.stringify(database.prepare('SELECT id, name, created_at AS createdAt FROM messages ORDER BY created_at DESC').all(), null, 2))
  } else if (command === 'delete' && argument) {
    const result = database.prepare('DELETE FROM messages WHERE id = ?').run(argument)
    if (!result.changes) throw new Error('No note has that ID.')
    console.log('Removed the note, its photo, and its hearts.')
  } else if (command === 'backup' && argument) {
    const destination = path.resolve(argument)
    if (existsSync(destination)) throw new Error('The backup destination already exists. Choose a new filename.')
    mkdirSync(path.dirname(destination), { recursive: true })
    await backup(database, destination)
    console.log(`Backup saved to ${destination}`)
  } else {
    throw new Error('Usage: node server/manage.js list | delete NOTE_ID | backup PATH.sqlite')
  }
} finally { database.close() }