import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RotateCcw } from 'lucide-react'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createBalloonGeometry } from './lib/balloonGeometry'

type FloatingObject = { mesh: THREE.Object3D; y: number; tilt: number; phase: number; kick: number }
type Balloon = { object: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>; start: number; index: number; seam: THREE.Group; tilt: number; turn: number; flatColor: THREE.Color; foilColor: THREE.Color }

export default function HeroScene({ paused, onCelebrate }: { paused: boolean; onCelebrate: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(paused)
  const celebrateRef = useRef(onCelebrate)
  const replayRef = useRef<() => void>(() => {})
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { celebrateRef.current = onCelebrate }, [onCelebrate])
  useEffect(() => {
    const container = host.current!
    let disposed = false
    let sceneReady = false
    function fail() { if (!disposed) setStatus('failed') }
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }) }
    catch {
      queueMicrotask(fail)
      return () => { disposed = true }
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(0, 0.2, 14)
    camera.lookAt(0, 0, 0)
    const environment = new RoomEnvironment()
    const softboxGeometry = new THREE.PlaneGeometry(1, 1)
    function softbox(x: number, y: number, z: number, width: number, height: number, color: string, intensity: number) {
      const surface = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
      const panel = new THREE.Mesh(softboxGeometry, surface)
      panel.position.set(x, y, z)
      panel.scale.set(width, height, 1)
      panel.lookAt(0, 1, 0)
      environment.add(panel)
    }
    softbox(-4, 5, 7, 2, 9, '#ffffff', 7)
    softbox(5, 3, 4, 1.3, 7, '#dfedff', 5)
    softbox(0, 8, 2, 8, 2, '#fff4df', 6)
    softbox(1, -1, 8, 9, 2, '#172129', 0.2)
    const generator = new THREE.PMREMGenerator(renderer)
    const environmentMap = generator.fromScene(environment, 0.015)
    scene.environment = environmentMap.texture
    scene.environmentIntensity = 0.65
    environment.dispose()
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa5a8cc, 1.5))
    const light = new THREE.DirectionalLight(0xfff5e3, 2.5)
    light.position.set(-5, 8, 7)
    scene.add(light)
    const party = new THREE.Group()
    scene.add(party)
    const floating: FloatingObject[] = []
    const balloons: Balloon[] = []
    const interactive: THREE.Object3D[] = []
    const materials: THREE.Material[] = []
    const geometries: THREE.BufferGeometry[] = []
    function material(color: string, metalness = 0.04) {
      const surface = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness, clearcoat: 0.65, clearcoatRoughness: 0.28 })
      materials.push(surface)
      return surface
    }
    function mesh(geometry: THREE.BufferGeometry, surface: THREE.Material) {
      geometries.push(geometry)
      return new THREE.Mesh(geometry, surface)
    }
    function float(object: THREE.Object3D, x: number, y: number, tilt: number, phase: number) {
      object.position.set(x, y, 0)
      object.rotation.z = tilt
      party.add(object)
      floating.push({ mesh: object, y, tilt, phase, kick: 0 })
    }
    const palette = ['#f7839b', '#ed7044', '#f1c84e', '#8fae80', '#91b5ef']
    const foilPalette = ['#ec9bb9', '#f4a578', '#ebcc72', '#accca2', '#a2c5ee']
    const flatPalette = ['#b75275', '#bd592e', '#a48221', '#597a46', '#426eab']
    const daisy = new THREE.Group()
    const petalMaterial = material('#f8f9ef')
    for (let petal = 0; petal < 8; petal++) {
      const angle = petal * Math.PI / 4
      const shape = mesh(new THREE.SphereGeometry(0.26, 20, 12), petalMaterial)
      shape.scale.set(0.74, 1.42, 0.58)
      shape.position.set(Math.sin(angle) * 0.35, Math.cos(angle) * 0.35, 0)
      shape.rotation.z = -angle
      daisy.add(shape)
    }
    const middle = mesh(new THREE.SphereGeometry(0.24, 24, 16), material('#eebd36'))
    middle.scale.z = 0.58
    middle.position.z = 0.14
    daisy.add(middle)
    daisy.rotation.y = 0.25
    float(daisy, -5, 1.05, -0.2, 1)
    const starShape = new THREE.Shape()
    for (let point = 0; point < 10; point++) {
      const angle = Math.PI / 2 + point * Math.PI / 5
      const radius = point % 2 ? 0.27 : 0.58
      if (point === 0) starShape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
      else starShape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    starShape.closePath()
    const littleStar = mesh(new THREE.ExtrudeGeometry(starShape, { depth: 0.17, bevelEnabled: true, bevelSegments: 5, steps: 1, bevelSize: 0.1, bevelThickness: 0.12 }), material('#f5be42', 0.15))
    littleStar.rotation.y = -0.3
    float(littleStar, 5, -0.5, 0.15, 3)
    for (let piece = 0; piece < 12; piece++) {
      const ribbon = mesh(new THREE.TorusGeometry(0.09, 0.035, 6, 14, Math.PI * 1.35), material(palette[piece % 5]))
      const side = piece % 2 ? 1 : -1
      ribbon.rotation.y = piece * 0.7
      float(ribbon, side * (2.4 + ((piece * 7) % 5) * 0.47), (piece % 3 === 0 ? 1 : -1) * (1.0 + (piece % 4) * 0.16), piece * 0.5, piece)
    }
    let elapsed = 0
    let previousPopOrder = ''
    function schedulePops(delay: number) {
      const order = [...balloons]
      for (let remaining = order.length - 1; remaining > 0; remaining--) {
        const chosen = Math.floor(Math.random() * (remaining + 1))
        ;[order[remaining], order[chosen]] = [order[chosen], order[remaining]]
      }
      const isPredictable = () => order.map((balloon) => balloon.index).join(',') === previousPopOrder ||
        order.every((balloon, position) => balloon.index === position) ||
        order.every((balloon, position) => balloon.index === order.length - position - 1)
      while (isPredictable()) order.push(order.splice(1, 1)[0])
      let nextStart = elapsed + delay
      order.forEach((balloon) => {
        balloon.start = nextStart
        nextStart += 0.13 + Math.random() * 0.13
      })
      previousPopOrder = order.map((balloon) => balloon.index).join(',')
      container.dataset.popOrder = previousPopOrder
    }
    function updateBalloons() {
      const amounts: number[] = []
      balloons.forEach((balloon) => {
        const time = Math.max(0, elapsed - balloon.start)
        const progress = pausedRef.current ? 1 : THREE.MathUtils.clamp(time / 0.32, 0, 1)
        const settle = Math.max(0, progress - 0.25)
        const puff = progress === 1 ? 1 : progress < 0.25
          ? 1.14 * (1 - (1 - progress / 0.25) ** 3)
          : 1 + 0.14 * Math.exp(-settle * 7) * Math.cos(settle * 11)
        balloon.object.morphTargetInfluences![0] = puff
        const finish = Math.min(puff, 1)
        balloon.object.material.color.copy(balloon.flatColor).lerp(balloon.foilColor, finish)
        balloon.object.material.metalness = 0.08 + finish * 0.92
        balloon.object.material.roughness = 0.7 - finish * 0.51
        balloon.object.material.envMapIntensity = 0.7 + finish * 1.45
        balloon.object.rotation.y = balloon.turn * finish + (pausedRef.current ? 0 : Math.sin(elapsed * 0.72 + balloon.index) * 0.07 * finish)
        balloon.object.rotation.x = -0.045 * finish
        balloon.seam.visible = finish > 0.6
        balloon.seam.scale.setScalar(Math.max(0.001, finish))
        const floater = floating.find((item) => item.mesh === balloon.object)!
        floater.tilt = balloon.tilt * finish
        if (!pausedRef.current && progress > 0 && progress < 1) {
          const impact = Math.exp(-progress * 3)
          balloon.object.position.y += Math.sin(progress * Math.PI) * 0.22 * impact
          balloon.object.rotation.z += Math.sin(progress * Math.PI * 2) * 0.09 * impact
        }
        amounts.push(Math.round(progress * 100))
      })
      container.dataset.inflation = amounts.join(',')
    }
    replayRef.current = () => {
      if (pausedRef.current) return
      schedulePops(0.28)
      updateBalloons()
      renderer.render(scene, camera)
    }
    new FontLoader().load(`${import.meta.env.BASE_URL}balloon-font.json`, (font) => {
      if (disposed) return
      const letters = [...'atlas'].map((letter, index) => {
        const geometry = createBalloonGeometry(font, letter)
        const bounds = geometry.boundingBox!
        const width = bounds.max.x - bounds.min.x
        const foil = material(foilPalette[index], 0.08)
        foil.clearcoat = 1
        foil.clearcoatRoughness = 0.16
        const object = mesh(geometry, foil) as Balloon['object']
        object.scale.setScalar(1.22)
        const seam = new THREE.Group()
        const seamMaterial = new THREE.MeshStandardMaterial({ color: foilPalette[index], metalness: 1, roughness: 0.32, envMapIntensity: 1.5 })
        materials.push(seamMaterial)
        const shapes = font.generateShapes(letter, 2.8)
        const originalBounds = new THREE.Box2().setFromPoints(shapes.flatMap((shape) => shape.getPoints(40)))
        const center = originalBounds.getCenter(new THREE.Vector2())
        shapes.forEach((shape) => {
          const outlines = [shape, ...shape.holes]
          outlines.forEach((outline) => {
            const points = outline.getPoints(40).map((point) => new THREE.Vector3(point.x - center.x, point.y - center.y, 0))
            const curve = new THREE.CatmullRomCurve3(points, true)
            seam.add(mesh(new THREE.TubeGeometry(curve, Math.min(points.length * 2, 320), 0.009, 4, true), seamMaterial))
          })
        })
        const knot = mesh(new THREE.ConeGeometry(0.075, 0.14, 12), seamMaterial)
        knot.position.set(0.04, bounds.min.y - 0.09, 0)
        knot.scale.z = 0.32
        seam.add(knot)
        object.add(seam)
        balloons.push({ object, seam, index, start: 0,
          flatColor: new THREE.Color(flatPalette[index]), foilColor: new THREE.Color(foilPalette[index]),
          tilt: [-0.09, 0.045, -0.09, 0.085, -0.09][index], turn: [-0.14, 0.16, -0.12, 0.18, -0.2][index] })
        return { object, width: width * 1.22 }
      })
      const spacing = 0.34
      const totalWidth = letters.reduce((sum, letter) => sum + letter.width, 0) + spacing * 4
      let cursor = -totalWidth / 2
      letters.forEach(({ object, width }, index) => {
        float(object, cursor + width / 2, [0, 0.14, 0.2, -0.02, 0.02][index], 0, index * 1.2)
        interactive.push(object)
        cursor += width + spacing
      })
      schedulePops(0.55)
      updateBalloons()
      renderer.render(scene, camera)
      sceneReady = true
      setStatus('ready')
    }, undefined, fail)
    let visible = true
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
    visibility.observe(container)
    function resize() {
      const { width, height } = container.getBoundingClientRect()
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.position.z = Math.max(7.7, 12.4 / (2 * Math.tan(THREE.MathUtils.degToRad(16)) * camera.aspect))
      camera.updateProjectionMatrix()
      if (sceneReady) renderer.render(scene, camera)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    const pointer = new THREE.Vector2()
    const raycaster = new THREE.Raycaster()
    function pointerMove(event: PointerEvent) {
      const bounds = container.getBoundingClientRect()
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1)
    }
    function click(event: PointerEvent) {
      pointerMove(event)
      raycaster.setFromCamera(pointer, camera)
      const [hit] = raycaster.intersectObjects(interactive, false)
      if (!hit) return
      const target = floating.find((item) => item.mesh === hit.object)
      if (target) target.kick = 0.6
      const balloon = balloons.find((item) => item.object === hit.object)
      if (balloon && !pausedRef.current) balloon.start = elapsed + 0.05
      celebrateRef.current()
    }
    container.addEventListener('pointermove', pointerMove)
    container.addEventListener('pointerdown', click)
    let frame = 0
    let previous = performance.now()
    function render(now: number) {
      frame = requestAnimationFrame(render)
      const delta = Math.min((now - previous) / 1000, 0.05)
      previous = now
      if (!sceneReady || !visible || document.hidden) return
      if (!pausedRef.current) elapsed += delta
      floating.forEach((item) => {
        const motion = pausedRef.current ? 0 : 1
        item.kick *= 0.94
        item.mesh.position.y = item.y + Math.sin(elapsed * 1.1 + item.phase) * 0.07 * motion + item.kick * motion
        item.mesh.rotation.z = item.tilt + Math.sin(elapsed * 0.65 + item.phase) * 0.025 * motion
      })
      updateBalloons()
      party.rotation.y = THREE.MathUtils.lerp(party.rotation.y, pausedRef.current ? 0 : pointer.x * 0.035, 0.03)
      renderer.render(scene, camera)
    }
    frame = requestAnimationFrame(render)
    return () => {
      disposed = true
      replayRef.current = () => {}
      cancelAnimationFrame(frame)
      observer.disconnect()
      visibility.disconnect()
      container.removeEventListener('pointermove', pointerMove)
      container.removeEventListener('pointerdown', click)
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((surface) => surface.dispose())
      environmentMap.dispose()
      generator.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])
  return <div className={`hero-scene is-${status}`}>
    <div className="hero-canvas" ref={host} aria-hidden="true" />
    {status === 'failed' && <div className="atlas-fallback" aria-hidden="true">{[...'atlas'].map((letter, index) => <span key={index}>{letter}</span>)}</div>}
    {status === 'ready' && <button type="button" className="icon-button balloon-replay" onClick={() => replayRef.current()} disabled={paused}
      aria-label="Replay balloon inflation" title={paused ? 'Animations are paused' : 'Inflate the balloons again'}><RotateCcw size={17} /></button>}
  </div>
}