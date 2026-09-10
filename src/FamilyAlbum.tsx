import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Heart, RotateCcw, ZoomIn } from 'lucide-react'
import { familyPhotoUrl, getFamilyPhotos } from './lib/api'
import type { FamilyPhoto } from './lib/api'

export default function FamilyAlbum({ onOpen }: { onOpen: (photos: FamilyPhoto[], index: number) => void }) {
  const [photos, setPhotos] = useState<FamilyPhoto[]>([])
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    void getFamilyPhotos().then((result) => { if (!cancelled) setPhotos(result.photos) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [attempt])
  if (!photos.length && !error) return null
  return <section className="family-album" aria-labelledby="family-title">
    <div className="family-heading"><div><span className="eyebrow coral-text">A FEW LITTLE MOMENTS</span><h2 id="family-title">Meet the <em>little legend.</em></h2><p>Atlas, Natalie & Duke. Our hearts? Completely melted.</p></div><span className="handwritten family-margin-note">yep, we're all smitten.<Heart size={18} /></span></div>
    {error ? <div className="load-error" role="alert"><span>The family album couldn't load just now.</span><button className="text-button" type="button" onClick={() => { setError(false); setAttempt((value) => value + 1) }}><RotateCcw size={15} /> Try again</button></div>
      : <div className="family-grid">{photos.map((photo, index) => <motion.figure key={photo.id} className={`family-print family-print-${index}`} initial={{ y: 12 }} whileInView={{ y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.45, delay: Math.min(index * 0.07, 0.21) }}>
        <button type="button" className="family-photo-button" aria-label={`View photo: ${photo.caption}`} onClick={() => onOpen(photos, index)}><img src={familyPhotoUrl(photo.id)} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" /><span className="family-photo-zoom" aria-hidden="true"><ZoomIn size={17} /></span></button>
        <figcaption>{photo.caption}</figcaption>
      </motion.figure>)}</div>}
  </section>
}