import { ref } from 'vue'
import { api } from '../api/client'

/**
 * Display time policy for admin pages.
 *
 * Database timestamps are UTC text (`YYYY-MM-DD HH:MM:SS`) reused by sorting, archiving and the device API,
 * so they are converted only here, at the rendering boundary. The zone comes from the server (`/api/admin/time`)
 * instead of the browser, which keeps pages, terminal logs and Excel exports on the same clock.
 */
const timeZone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
let pending: Promise<void> | null = null

export function ensureServerTimeZone(): Promise<void> {
  if (!pending) {
    pending = api<{ timeZone: string }>('/api/admin/time')
      .then((data) => { if (data?.timeZone) timeZone.value = data.timeZone })
      // Not signed in yet or the request failed: retry on the next render instead of caching the failure.
      .catch(() => { pending = null })
  }
  return pending
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function zoneParts(date: Date) {
  const zone = timeZone.value
  let formatter = formatters.get(zone)
  if (!formatter) {
    const options: Intl.DateTimeFormatOptions = { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }
    try { formatter = new Intl.DateTimeFormat('en-US', { ...options, timeZone: zone }) }
    catch { formatter = new Intl.DateTimeFormat('en-US', options) }
    formatters.set(zone, formatter)
  }
  return Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value])) as Record<string, string>
}

/** Stored timestamps carry no zone suffix; they are always UTC. */
function parseStoredUtc(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec((value ?? '').trim())
  if (!match) return null
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]))
  return Number.isNaN(time) ? null : new Date(time)
}

function render(value: string | null | undefined, fallback: string, build: (parts: Record<string, string>) => string) {
  void ensureServerTimeZone()
  const date = parseStoredUtc(value)
  if (!date) return value ? String(value) : fallback
  return build(zoneParts(date))
}

/** `2026-10-15 15:04:05` in the display time zone. */
export function formatDateTime(value: string | null | undefined, fallback = '—') {
  return render(value, fallback, parts => `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`)
}

/** `2026-10-15` in the display time zone. */
export function formatDate(value: string | null | undefined, fallback = '—') {
  return render(value, fallback, parts => `${parts.year}-${parts.month}-${parts.day}`)
}

/** `15:04:05` for browser-side "just now" labels such as the ADB operation log. */
export function formatTimeOfDay(date = new Date()) {
  void ensureServerTimeZone()
  const parts = zoneParts(date)
  return `${parts.hour}:${parts.minute}:${parts.second}`
}
