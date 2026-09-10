import { readFileSync, writeFileSync } from 'node:fs'
import opentype from 'opentype.js'

const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/convert-balloon-font.mjs /path/to/CherryBombOne-Regular.ttf')
const bytes = readFileSync(source)
const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
const glyphs = {}
for (const character of new Set('atlas?')) {
  const glyph = font.charToGlyph(character)
  const outline = glyph.path.commands.map((command) => {
    if (command.type === 'M' || command.type === 'L') return `${command.type.toLowerCase()} ${command.x} ${command.y}`
    if (command.type === 'Q') return `q ${command.x} ${command.y} ${command.x1} ${command.y1}`
    if (command.type === 'C') return `b ${command.x} ${command.y} ${command.x1} ${command.y1} ${command.x2} ${command.y2}`
    return ''
  }).join(' ')
  const bounds = glyph.getBoundingBox()
  glyphs[character] = { ha: glyph.advanceWidth, x_min: bounds.x1, x_max: bounds.x2, o: outline }
}
writeFileSync('public/balloon-font.json', JSON.stringify({
  glyphs, familyName: 'Cherry Bomb One', resolution: font.unitsPerEm,
  ascender: font.ascender, descender: font.descender,
  boundingBox: { yMin: font.descender, yMax: font.ascender },
  underlineThickness: 50,
  original_font_information: { source: 'https://github.com/google/fonts/tree/main/ofl/cherrybombone', license: 'SIL Open Font License 1.1; see balloon-font-OFL.txt' },
}))
console.log('Created the local Atlas glyph subset in public/balloon-font.json')