import { Float32BufferAttribute, Vector2, Vector3 } from 'three'
import type { BufferGeometry } from 'three'
import type { Font } from 'three/addons/loaders/FontLoader.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

export function createBalloonGeometry(font: Font, letter: string): BufferGeometry {
  const shapes = font.generateShapes(letter, 2.8)
  const outlines = shapes.flatMap((shape) => [shape.getPoints(40), ...shape.holes.map((hole) => hole.getPoints(40))])
  const source = new TextGeometry(letter, { font, size: 2.8, depth: 0.04, curveSegments: 20,
    bevelEnabled: false, steps: 2 })
  source.computeBoundingBox()
  const center = source.boundingBox!.getCenter(new Vector3())
  const subdivided = new TessellateModifier(0.085, 9).modify(source)
  source.dispose()
  subdivided.deleteAttribute('normal')
  subdivided.deleteAttribute('uv')
  const geometry = mergeVertices(subdivided, 0.0001)
  subdivided.dispose()
  const position = geometry.getAttribute('position')
  const inflated = new Float32Array(position.count * 3)
  const point = new Vector2()
  const nearest = new Vector2()
  const segment = new Vector2()
  const offset = new Vector2()
  for (let vertex = 0; vertex < position.count; vertex++) {
    point.set(position.getX(vertex), position.getY(vertex))
    let distanceSquared = Infinity
    for (const outline of outlines) {
      for (let edge = 0; edge < outline.length - 1; edge++) {
        segment.subVectors(outline[edge + 1], outline[edge])
        offset.subVectors(point, outline[edge])
        const along = Math.max(0, Math.min(1, offset.dot(segment) / (segment.lengthSq() || 1)))
        nearest.copy(outline[edge]).addScaledVector(segment, along)
        distanceSquared = Math.min(distanceSquared, point.distanceToSquared(nearest))
      }
    }
    const distance = Math.sqrt(distanceSquared)
    const originalDepth = position.getZ(vertex) - 0.02
    const face = Math.max(-1, Math.min(1, originalDepth / 0.02))
    const cushion = 0.025 + 0.6 * Math.sqrt(1 - Math.exp(-distance * 5))
    const wrinkle = Math.sin(point.y * 51 + point.x * 37) * 0.006 * Math.exp(-distance * 17)
    inflated[vertex * 3] = point.x - center.x
    inflated[vertex * 3 + 1] = point.y - center.y
    inflated[vertex * 3 + 2] = face * (cushion + wrinkle)
    position.setXYZ(vertex, (point.x - center.x) * 0.88, (point.y - center.y) * 0.96, originalDepth * 0.28)
  }
  geometry.computeVertexNormals()
  const target = geometry.clone()
  target.setAttribute('position', new Float32BufferAttribute(inflated, 3))
  target.computeVertexNormals()
  geometry.morphAttributes.position = [target.getAttribute('position').clone()]
  geometry.morphAttributes.normal = [target.getAttribute('normal').clone()]
  target.dispose()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}