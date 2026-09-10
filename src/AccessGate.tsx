import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowRight, Eye, EyeOff, Flower2, Heart, LoaderCircle, RotateCcw, Star } from 'lucide-react'
import { getSession, login, logout } from './lib/api'
import type { Session } from './lib/api'

export default function AccessGate({ children }: { children: (session: Session, onExit: () => Promise<void>) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    try { sessionStorage.removeItem('atlas-invite') } catch { /* Old versions saved the invite code here. */ }
    void getSession().then((result) => {
      if (!cancelled) setSession(result)
    }).catch(() => {
      if (!cancelled) setError("The party's taking a tiny breather. Try again in a moment.")
    }).finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [attempt])
  useEffect(() => {
    function expired() {
      setSession({ authenticated: false, inviteRequired: true })
      setCode('')
      setBusy(false)
      setError('Time for a fresh hello. Pop your code in again; your note text is saved on this device.')
    }
    window.addEventListener('atlas-session-expired', expired)
    return () => window.removeEventListener('atlas-session-expired', expired)
  }, [])
  useEffect(() => {
    if (!session?.authenticated || !session.inviteRequired) return
    let cancelled = false
    async function recheck() {
      try {
        const result = await getSession()
        if (!cancelled && !result.authenticated) window.dispatchEvent(new Event('atlas-session-expired'))
      } catch { return }
    }
    function visibility() { if (!document.hidden) void recheck() }
    document.addEventListener('visibilitychange', visibility)
    const timer = setInterval(() => { if (!document.hidden) void recheck() }, 60_000)
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [session])
  async function enter(event: FormEvent) {
    event.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true)
    setError('')
    try {
      await login(code.trim())
      setCode('')
      setShowCode(false)
      setSession({ authenticated: true, inviteRequired: true })
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  async function leave() {
    await logout()
    setError('')
    setCode('')
    setSession({ authenticated: false, inviteRequired: true })
  }
  if (session?.authenticated) return children(session, leave)
  return <div className="invite-page">
    <header className="invite-header"><span className="wordmark"><Flower2 size={29} /><span>hello, atlas.</span></span><span className="handwritten">a little party, just for us</span></header>
    <main className="invite-main">
      <div className="invite-ornament" aria-hidden="true"><Star className="invite-star" /><Flower2 className="invite-flower" /><Heart className="invite-heart" /></div>
      <span className="eyebrow coral-text">YOU'RE ON THE GUEST LIST</span>
      <h1>Small human.<br /><em>Big welcome.</em></h1>
      <p className="invite-greeting">A little love for Atlas, Natalie & Duke.</p>
      {checking ? <div className="invite-check" role="status"><LoaderCircle className="spin" size={19} /> Getting the party ready...</div>
        : !session ? <div className="invite-retry"><p className="form-error" role="alert">{error}</p><button type="button" className="button secondary" onClick={() => { setError(''); setChecking(true); setAttempt((value) => value + 1) }}><RotateCcw size={17} /> Try again</button></div>
          : <form className="invite-form" onSubmit={enter}>
            <label htmlFor="team-code">Team invite code</label>
            <div className="invite-code-input"><input id="team-code" type={showCode ? 'text' : 'password'} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={512} value={code} onChange={(event) => { setCode(event.target.value); if (!event.target.value) setShowCode(false) }} placeholder="Your little way in" required disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? 'invite-error' : undefined} />{code.length > 0 && <button className="icon-button" type="button" title={showCode ? 'Hide code' : 'Show code'} aria-label={showCode ? 'Hide code' : 'Show code'} aria-pressed={showCode} onClick={() => setShowCode(!showCode)}>{showCode ? <EyeOff size={18} /> : <Eye size={18} />}</button>}</div>
            {error && <p id="invite-error" className="form-error" role="alert">{error}</p>}
            <button className="button primary" type="submit" disabled={busy || !code.trim()}>{busy ? <LoaderCircle className="spin" size={18} /> : <Heart size={18} />}{busy ? 'Checking your invitation...' : 'Come on in'}{!busy && <ArrowRight size={18} />}</button>
          </form>}
      <span className="invite-signoff handwritten">tiny socks. enormous amounts of love.</span>
    </main>
    <footer className="invite-footer">with love, <strong>MET Inventory & more</strong><Heart size={13} /></footer>
  </div>
}