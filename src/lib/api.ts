export type NoteColor = 'peach' | 'blue' | 'yellow' | 'pink' | 'green'
export type Sticker = 'heart' | 'star' | 'flower'
export type Note = { id: string; name: string; body: string; color: NoteColor; sticker: Sticker; createdAt: string; hasPhoto: boolean; hearts: number }
export type Draft = Pick<Note, 'name' | 'body' | 'color' | 'sticker'> & { photo?: string }
const base = (import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}api`).replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
export function recall(key: string, fallback = '') {
  try { return localStorage.getItem(`atlas-${key}`) || fallback } catch { return fallback }
}
export function remember(key: string, value: string) {
  try { localStorage.setItem(`atlas-${key}`, value) } catch { return }
}
export function inviteCode() {
  try { return sessionStorage.getItem('atlas-invite') || '' } catch { return '' }
}
export function saveInvite(value: string) {
  try { sessionStorage.setItem('atlas-invite', value) } catch { return }
}
async function request<Result>(route: string, options?: RequestInit): Promise<Result> {
  let response: Response
  try { response = await fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(20_000) }) }
  catch { throw new ApiError("Can't reach the love board right now. Please try again in a moment.", 0) }
  if (!response.headers.get('content-type')?.includes('application/json')) throw new ApiError("The love board isn't connected yet. Come back in a little bit.", 503)
  const data = await response.json()
  if (!response.ok) throw new ApiError(data.error || "Couldn't save just now. Please try again.", response.status)
  return data
}
export const getNotes = () => request<{ messages: Note[] }>('/messages')
export const getHealth = () => request<{ inviteRequired: boolean }>('/health')
export const photoUrl = (id: string) => `${base}/photos/${encodeURIComponent(id)}`
export const sendNote = (draft: Draft, code: string) => request<{ message: Note }>('/messages', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Invite-Key': code }, body: JSON.stringify(draft),
})
export const sendHeart = (id: string, active: boolean, visitorId: string) => request<{ hearts: number }>(`/messages/${id}/heart`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Invite-Key': inviteCode() }, body: JSON.stringify({ visitorId, active }),
})
export async function readPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('A JPG, PNG, or WebP, please. Export HEIC photos as JPG first.')
  if (file.size > 6 * 1024 * 1024) throw new Error('A little too big! Choose a photo under 6 MB.')
  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Couldn't open that photo. Try another one?"))
    reader.readAsDataURL(file)
  })
  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => image.naturalWidth * image.naturalHeight > 40_000_000 ? reject(new Error('That photo has too many pixels. Try a smaller version.')) : resolve()
    image.onerror = () => reject(new Error("Couldn't open that photo. Try another one?"))
    image.src = result
  })
  return result
}