import { lazy, Suspense, useDeferredValue, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import { ArrowDown, ArrowUpRight, Check, ChevronDown, Flower2, Heart, ImagePlus, LoaderCircle, LogOut, PartyPopper, Pause, Play, Plus, Search, Send, Share2, Star, Trash2, X } from 'lucide-react'
import confetti from 'canvas-confetti'
import { getNotes, photoUrl, readPhoto, recall, remember, sendHeart, sendNote } from './lib/api'
import type { Draft, Note, NoteColor, Sticker } from './lib/api'
import AccessGate from './AccessGate'
import './App.css'

const HeroScene = lazy(() => import('./HeroScene'))
const colors: NoteColor[] = ['peach', 'blue', 'yellow', 'pink', 'green']
const stickerNames: Sticker[] = ['heart', 'star', 'flower']
const initialDraft: Draft = { name: '', body: '', color: 'yellow', sticker: 'flower' }
const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })

function StickerIcon({ type, size = 30 }: { type: Sticker; size?: number }) {
  const Icon = type === 'heart' ? Heart : type === 'star' ? Star : Flower2
  return <Icon size={size} strokeWidth={1.5} className={`sticker-icon sticker-${type}`} aria-hidden="true" />
}
function Dialog({ children, label, onClose, className = '' }: { children: ReactNode; label: string; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={ref} className={className} aria-label={label} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => {
    if (event.target === event.currentTarget) {
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }
  }}><button className="icon-button dialog-close" type="button" onClick={onClose} aria-label="Close" title="Close"><X size={20} /></button>{children}</dialog>
}
function Composer({ onClose, onSaved, inviteRequired }: { onClose: () => void; onSaved: (note: Note) => void; inviteRequired: boolean }) {
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = JSON.parse(recall('draft', '{}'))
      return { ...initialDraft, name: typeof saved.name === 'string' ? saved.name.slice(0, 60) : '', body: typeof saved.body === 'string' ? saved.body.slice(0, 1600) : '',
        color: colors.includes(saved.color) ? saved.color : 'yellow', sticker: stickerNames.includes(saved.sticker) ? saved.sticker : 'flower' }
    } catch { return initialDraft }
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const photoRead = useRef(0)
  useEffect(() => { const { photo: _photo, ...textDraft } = draft; remember('draft', JSON.stringify(textDraft)) }, [draft])
  async function choosePhoto(file?: File) {
    if (!file) return
    const version = ++photoRead.current
    setReading(true)
    setError('')
    try { const photo = await readPhoto(file); if (version === photoRead.current) setDraft((current) => ({ ...current, photo })) }
    catch (cause) { if (version === photoRead.current) setError((cause as Error).message) }
    finally { if (version === photoRead.current) setReading(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || reading) return
    setBusy(true)
    setError('')
    try {
      const { message } = await sendNote(draft)
      remember('draft', '')
      onSaved(message)
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  return <Dialog label="Leave a little love" onClose={() => { if (!busy) onClose() }} className="composer">
    <aside className={`composer-preview paper-${draft.color}`} aria-label="Note preview"><span className="eyebrow">FOR ATLAS, NATALIE & DUKE</span><StickerIcon type={draft.sticker} size={58} />
      {draft.photo && <img className="preview-photo" src={draft.photo} alt="Your selected photo" />}<p className="preview-message">{draft.body || 'Big feelings. Tiny person.'}</p><span className="handwritten">with love, {draft.name || 'you'}</span><div className="preview-postmark"><Heart size={13} /> SPECIAL DELIVERY</div></aside>
    <form onSubmit={submit} className="compose-form"><span className="eyebrow coral-text">SIGNED, SEALED, SO MUCH LOVE</span><h2>A little love for<br /><em>the whole crew.</em></h2>
      <fieldset disabled={busy} className="form-fields"><label htmlFor="note-name">Your name</label><input id="note-name" name="name" autoComplete="name" placeholder="The name behind the love" required maxLength={60} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <div className="label-line"><label htmlFor="note-body">Your little love note</label><span>{draft.body.length}/1,600</span></div><textarea id="note-body" name="body" rows={4} required maxLength={1600} placeholder="Hey Natalie, Duke & little Atlas..." value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
        <div className="personalize-row"><fieldset className="choices"><legend>Pick your paper</legend><div className="swatches">{colors.map((color) => <label key={color} className={`swatch paper-${color}`} title={`${color} paper`}><input type="radio" name="color" value={color} checked={draft.color === color} onChange={() => setDraft({ ...draft, color })} aria-label={`${color} paper`} />{draft.color === color && <Check size={16} />}</label>)}</div></fieldset>
          <fieldset className="choices"><legend>A finishing touch</legend><div className="sticker-choices">{stickerNames.map((sticker) => <label key={sticker} title={`${sticker} sticker`} className={draft.sticker === sticker ? 'selected' : ''}><input type="radio" name="sticker" value={sticker} checked={draft.sticker === sticker} onChange={() => setDraft({ ...draft, sticker })} aria-label={`${sticker} sticker`} /><StickerIcon type={sticker} size={21} /></label>)}</div></fieldset></div>
        <input type="file" accept="image/jpeg,image/png,image/webp" ref={fileInput} className="sr-only" aria-label="Choose a photo" onChange={(event) => { void choosePhoto(event.target.files?.[0]); event.target.value = '' }} />
        {draft.photo ? <div className="upload-selected"><img src={draft.photo} alt="Selected upload" /><span>A little memory, attached.</span><button type="button" className="icon-button" aria-label="Remove photo" title="Remove photo" onClick={() => { photoRead.current++; setReading(false); setDraft({ ...draft, photo: undefined }) }}><Trash2 size={18} /></button></div>
          : <button type="button" disabled={reading} className={`upload-zone ${dragging ? 'is-dragging' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void choosePhoto(event.dataTransfer.files[0]) }}>
            {reading ? <LoaderCircle className="spin" size={24} /> : <ImagePlus size={24} />}<span><strong>{reading ? 'Opening your photo...' : 'Add a photo, make it personal'}</strong><small>Optional · JPG, PNG, WebP · up to 6 MB</small></span><Plus size={18} /></button>}
        <p className="privacy-note">{inviteRequired ? 'For everyone with the invite code. Share photos with permission; guests can save a copy.' : "A little heads-up: this board is public. Only share photos you're happy for everyone to see."}</p>{error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button primary submit-note" disabled={busy || reading || !draft.name.trim() || !draft.body.trim()}>{busy ? <LoaderCircle size={18} className="spin" /> : <Send size={17} />}{busy ? 'Sending your love...' : 'Send a little love'}</button>
      </fieldset></form>
  </Dialog>
}
function NoteCard({ note, liked, onHeart, onPhoto }: { note: Note; liked: boolean; onHeart: () => Promise<void>; onPhoto: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [heartBusy, setHeartBusy] = useState(false)
  return <motion.article layout initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className={`note-card paper-${note.color}`}>
    <div className="tape" aria-hidden="true" /><div className="note-topline"><span className="eyebrow">A LITTLE LOVE, JUST FOR YOU</span><StickerIcon type={note.sticker} /></div>
    {note.hasPhoto && <button className="note-photo" type="button" onClick={onPhoto} aria-label={`Open photo from ${note.name}`}><img src={photoUrl(note.id)} alt={`A photo shared by ${note.name}`} loading="lazy" /><span><Plus size={17} /></span></button>}
    <p className={`note-body ${expanded ? '' : 'is-clamped'}`}>{note.body}</p>{note.body.length > 240 && <button type="button" className="text-button read-more" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? 'A little less' : 'Read the whole note'} <ChevronDown size={14} /></button>}
    <div className="note-footer"><div><span className="note-author">{note.name}</span><time dateTime={note.createdAt}>{dateFormat.format(new Date(note.createdAt))}</time></div><button type="button" className={`heart-button ${liked ? 'is-liked' : ''}`} disabled={heartBusy} aria-label={`${liked ? 'Remove love from' : 'Send love to'} ${note.name}'s note`} aria-pressed={liked} onClick={async () => { setHeartBusy(true); try { await onHeart() } finally { setHeartBusy(false) } }}><Heart size={17} /> <span>{note.hearts}</span></button></div>
  </motion.article>
}
function Party({ inviteRequired, onExit }: { inviteRequired: boolean; onExit: () => Promise<void> }) {
  const reducedMotion = useReducedMotion()
  const [paused, setPaused] = useState(() => recall('paused') === 'true')
  const motionOff = paused || Boolean(reducedMotion)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [composing, setComposing] = useState(false)
  const [photoNote, setPhotoNote] = useState<Note | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'photos'>('all')
  const [sort, setSort] = useState('newest')
  const [query, setQuery] = useState('')
  const search = useDeferredValue(query.toLowerCase().trim())
  const [toast, setToast] = useState('')
  const [likedIds, setLikedIds] = useState<string[]>(() => { try { const saved = JSON.parse(recall('hearts', '[]')); return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string') : [] } catch { return [] } })
  const [visitorId] = useState(() => { const previous = recall('visitor'); const id = /^[a-f0-9-]{36}$/i.test(previous) ? previous : crypto.randomUUID(); remember('visitor', id); return id })
  const celebrationTime = useRef(0)
  const loadVersion = useRef(0)
  const [refresh, setRefresh] = useState(0)
  function retryLoad() {
    setLoading(true)
    setLoadError('')
    setRefresh((current) => current + 1)
  }
  useEffect(() => {
    let cancelled = false
    const version = ++loadVersion.current
    void getNotes().then((result) => {
      if (cancelled || version !== loadVersion.current) return
      setNotes(result.messages)
    }).catch(() => {
      if (!cancelled && version === loadVersion.current) setLoadError("The love board is taking a tiny nap. We couldn't load the notes.")
    }).finally(() => {
      if (!cancelled && version === loadVersion.current) setLoading(false)
    })
    return () => { cancelled = true }
  }, [refresh])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5500); return () => clearTimeout(timer) }, [toast])
  function celebrate() {
    if (motionOff) { setToast('All the love in the world for Atlas, Natalie & Duke.'); return }
    if (Date.now() - celebrationTime.current < 700) return
    celebrationTime.current = Date.now()
    void confetti({ particleCount: 95, spread: 85, origin: { y: 0.57 }, colors: ['#ef745b', '#efb5cb', '#e7c64e', '#8bab80', '#91b6e9'], disableForReducedMotion: true, zIndex: 9999, ticks: 170, gravity: 0.8, scalar: 1.15 })
  }
  function saved(note: Note) {
    loadVersion.current++
    setLoading(false); setLoadError(''); setNotes((current) => [note, ...current]); setComposing(false); setQuery(''); setFilter('all'); setSort('newest')
    setToast('Your love is on the board. One lucky little crew!'); celebrate()
    requestAnimationFrame(() => document.getElementById('love-board')?.scrollIntoView({ behavior: motionOff ? 'instant' : 'smooth' }))
  }
  async function heart(note: Note) {
    const active = !likedIds.includes(note.id)
    try {
      const result = await sendHeart(note.id, active, visitorId)
      setNotes((current) => current.map((item) => item.id === note.id ? { ...item, hearts: result.hearts } : item))
      setLikedIds((current) => { const next = active ? [...current, note.id] : current.filter((id) => id !== note.id); remember('hearts', JSON.stringify(next)); return next })
    } catch (cause) { setToast((cause as Error).message) }
  }
  async function share() {
    const url = new URL(location.href); url.hash = ''; url.search = ''
    try { if (navigator.share) await navigator.share({ title: 'Oh, hi Atlas!', text: 'A tiny human. A whole lot of love. Come celebrate Atlas, Natalie & Duke!', url: url.href }); else { await navigator.clipboard.writeText(url.href); setToast('Link copied. Bring the whole fan club.') } }
    catch (cause) { if ((cause as Error).name !== 'AbortError') setToast('The link is in your address bar, ready to share.') }
  }
  const filtered = notes.filter((note) => (filter === 'all' || note.hasPhoto) && `${note.name} ${note.body}`.toLowerCase().includes(search))
  const shown = sort === 'oldest' ? [...filtered].reverse() : filtered
  const showKeepsakes = filter === 'all' && !search
  return <MotionConfig reducedMotion={motionOff ? 'always' : 'user'}><div className={`site ${motionOff ? 'motion-paused' : ''}`}>
    <a className="skip-link" href="#love-board">Skip to the love board</a>
    <header className="site-header"><a href="#" className="wordmark" aria-label="Hello Atlas, back to top"><Flower2 size={29} strokeWidth={1.6} /><span>hello, atlas<span className="wordmark-dot">.</span></span></a><span className="header-dedication">a little party for a whole lot of love</span>
      <div className="header-actions"><a href="#love-board" className="board-link">The love board <ArrowDown size={14} /></a><button type="button" className="icon-button" aria-label={motionOff ? 'Turn animations on' : 'Pause animations'} title={reducedMotion ? 'Reduced motion follows your device setting' : motionOff ? 'Turn animations on' : 'Pause animations'} disabled={Boolean(reducedMotion)} onClick={() => { setPaused(!paused); remember('paused', String(!paused)) }}>{motionOff ? <Play size={17} /> : <Pause size={17} />}</button><button type="button" className="icon-button party-button" onClick={celebrate} aria-label="Celebrate Atlas" title="A little extra confetti"><PartyPopper size={20} /></button></div></header>
    <main><section className="welcome" aria-labelledby="welcome-title"><div className="hero-grid" aria-hidden="true" /><motion.div className="hero-intro" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}><span className="welcome-eyebrow"><span /> THE WORLD JUST GOT A LITTLE SWEETER</span><p className="hello-script">oh, hi</p></motion.div>
      <h1 id="welcome-title" className="sr-only">Atlas</h1><div className="scene-wrap"><Suspense fallback={null}><HeroScene paused={motionOff} onCelebrate={celebrate} /></Suspense></div>
      <div className="hero-side-note left-note" aria-hidden="true">tiny human,<br />very big deal.<span className="drawn-arrow"><ArrowDown size={35} strokeWidth={1} /></span></div><div className="adored-stamp" aria-hidden="true"><span>100%</span><span>adored</span><Heart size={15} fill="currentColor" /></div>
      <motion.div className="hero-bottom" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.18 }}><h2>Small human. <em>Huge fan club.</em></h2><p>Natalie & Duke, what a little legend.<br />We're a little obsessed. And so happy for you both.</p><button className="button primary hero-cta" type="button" onClick={() => setComposing(true)}><Heart size={18} /> Leave a little love <ArrowUpRight size={18} /></button><div className="from-the-team"><span className="mini-flowers" aria-hidden="true"><Flower2 /><Star /><Heart /></span><span>with love, <strong>MET Inventory & more</strong></span></div></motion.div><span className="hero-edition" aria-hidden="true">ONE TINY, WONDERFUL BEGINNING</span><a className="scroll-invitation" href="#love-board" aria-label="Scroll to the love board"><ArrowDown size={20} /></a></section>
      <div className="party-ribbon" aria-hidden="true"><div>{Array.from({ length: 4 }, (_, index) => <span key={index}>BIG LOVE <Flower2 size={20} /> TINY SOCKS <Star size={19} /> BRAND NEW ADVENTURES <Heart size={20} /></span>)}</div></div>
      <section id="love-board" className="love-board" aria-labelledby="board-title"><div className="board-heading"><div><span className="eyebrow coral-text">THE OFFICIAL ATLAS FAN CLUB</span><h2 id="board-title">A whole lot of <em>love.</em><span className="heading-star" aria-hidden="true">*</span></h2><p>For Atlas, Natalie & Duke. And this lovely, messy new chapter.</p></div><button type="button" className="button secondary" onClick={() => setComposing(true)}><Plus size={18} /> Add your note</button></div>
        <div className="board-toolbar"><div className="filter-tabs" role="group" aria-label="Filter notes"><button type="button" aria-pressed={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All the love <span>{notes.length + 1}</span></button><button type="button" aria-pressed={filter === 'photos'} className={filter === 'photos' ? 'active' : ''} onClick={() => setFilter('photos')}>With photos <span>{notes.filter((note) => note.hasPhoto).length}</span></button></div>
          <div className="board-tools"><label className="search-field"><Search size={16} /><input type="search" placeholder="Find a note" aria-label="Search notes" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="sort-field"><span className="sr-only">Sort notes</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><ChevronDown size={14} /></label></div></div>
        {loadError && <div className="load-error" role="alert"><span>{loadError}</span><button type="button" className="text-button" onClick={retryLoad}>Try again</button></div>}{loading && <div className="loading-notes" role="status"><LoaderCircle size={20} className="spin" /> Gathering the love...</div>}
        <div className="notes-grid">{showKeepsakes && <article className="note-card team-note paper-peach"><div className="tape" aria-hidden="true" /><div className="note-topline"><span className="eyebrow">THE VERY FIRST HELLO</span><StickerIcon type="heart" size={33} /></div><h3>Hey Atlas,<br /><em>we're your people, too.</em></h3><p>You hit the jackpot with Natalie and Duke. And now? A whole bonus crew cheering you all on.</p><p>To you both: sending so much love for the tiny yawns, the happy chaos, and all the little firsts with Atlas.</p><div className="team-signature"><span className="handwritten">big hugs, all round.</span><strong>MET Inventory & more</strong><span>Duke's work fam, cheering for you all</span></div></article>}
          <AnimatePresence>{shown.map((note) => <NoteCard key={note.id} note={note} liked={likedIds.includes(note.id)} onHeart={() => heart(note)} onPhoto={() => setPhotoNote(note)} />)}</AnimatePresence>
          {showKeepsakes && <article className="art-postcard" aria-label="A little keepsake: oh the places you'll grow"><div className="postcard-border"><span className="postcard-top">A LITTLE WISH FOR YOU</span><div className="garden" aria-hidden="true"><div className="garden-stem stem-one"><Flower2 /></div><div className="garden-stem stem-two"><Flower2 /></div><div className="garden-stem stem-three"><Flower2 /></div><Star className="garden-star" size={25} /></div><h3>oh, the places<br />you'll <em>grow.</em></h3><span className="postcard-bottom">STAY LITTLE. DREAM BIG.</span></div></article>}
          {showKeepsakes && <button type="button" className="add-note-tile" onClick={() => setComposing(true)}><span className="add-note-icon"><Plus size={31} strokeWidth={1.3} /></span><span className="handwritten">This little spot<br />has your name on it.</span><span className="add-note-label">Leave Atlas a note <ArrowUpRight size={17} /></span></button>}</div>
        {!loading && !loadError && !showKeepsakes && shown.length === 0 && <div className="empty-state"><Flower2 size={44} /><h3>{search ? 'No notes found, little detective.' : 'The first photo could be yours.'}</h3><p>{search ? 'Try another name or a different word.' : 'A familiar face. A favorite memory. A little piece of you.'}</p><button type="button" className="button secondary" onClick={() => search ? setQuery('') : setComposing(true)}>{search ? <X size={17} /> : <ImagePlus size={17} />}{search ? 'Clear search' : 'Add a photo note'}</button></div>}
        <div className="board-bottom"><span><Heart size={14} /> A little time capsule of a very big kind of love.</span><button type="button" className="text-button" onClick={() => void share()}><Share2 size={16} /> Invite more love</button></div></section>
      <section className="dedication" aria-labelledby="dedication-title"><span className="eyebrow">NATALIE & DUKE, THIS ONE'S FOR YOU</span><h2 id="dedication-title">Tiny socks.<br /><em>Big, big love.</em></h2><p>Here's to the sleepy cuddles, the happy little surprises,<br className="desktop-break" /> and finding your own rhythm together. No perfect-parent stuff.</p><span className="handwritten">You've got each other. We're cheering you both on.</span><Flower2 className="dedication-flower" aria-hidden="true" /></section></main>
    <footer className="site-footer"><a className="wordmark" href="#"><Flower2 size={23} /><span>hello, atlas.</span></a><span>Made of love. And a little bit of confetti.</span><span>MET Inventory & more <Heart size={13} /></span>{inviteRequired && <button type="button" className="icon-button" disabled={leaving} aria-label="Sign out" title="Sign out" onClick={async () => { setLeaving(true); try { await onExit() } catch { setToast("Couldn't sign out just now. Please try again."); setLeaving(false) } }}><LogOut size={17} /></button>}</footer>
    {composing && <Composer inviteRequired={inviteRequired} onClose={() => setComposing(false)} onSaved={saved} />}{photoNote && <Dialog label={`Photo from ${photoNote.name}`} className="photo-dialog" onClose={() => setPhotoNote(null)}><img src={photoUrl(photoNote.id)} alt={`A photo shared by ${photoNote.name}`} /><div><span className="handwritten">with love, {photoNote.name}</span><p>{photoNote.body}</p></div></Dialog>}
    <div className="toast-region" role="status" aria-live="polite"><AnimatePresence>{toast && <motion.div className="toast" key={toast} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}><Heart size={18} /><span>{toast}</span><button type="button" className="icon-button" onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16} /></button></motion.div>}</AnimatePresence></div>
  </div></MotionConfig>
}
function App() {
  return <AccessGate>{(session, onExit) => <Party inviteRequired={session.inviteRequired} onExit={onExit} />}</AccessGate>
}
export default App