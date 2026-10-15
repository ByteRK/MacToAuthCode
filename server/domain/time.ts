/**
 * Timestamp policy for the whole application.
 *
 * Storage is always UTC text in the SQLite `CURRENT_TIMESTAMP` shape (`YYYY-MM-DD HH:MM:SS`), so audit
 * archiving, FIFO ordering and lexical range queries keep working without conversion. Every value that a
 * human reads — admin pages, console logs, Excel exports — is converted to one display time zone, which
 * defaults to the host system zone and can be overridden through the `timezone` runtime setting.
 */

const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone:string){
  let cached=formatters.get(timeZone)
  if(!cached){
    cached=new Intl.DateTimeFormat('en-US',{timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})
    formatters.set(timeZone,cached)
  }
  return cached
}

function zoneParts(date:Date,timeZone:string){
  return Object.fromEntries(formatter(timeZone).formatToParts(date).map(part=>[part.type,part.value])) as Record<string,string>
}
const assemble=(parts:Record<string,string>)=>`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`

let cachedSystemTimeZone:string|undefined

/** System zone fallback; cached because `resolvedOptions` is comparatively expensive. */
export function systemTimeZone(){return cachedSystemTimeZone??(cachedSystemTimeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')}

/**
 * Resolve the configured IANA zone. Empty values fall back to the host system zone, and invalid names fail
 * fast at startup instead of silently rendering every timestamp in the wrong zone.
 */
export function resolveTimeZone(configured?:string|null):string{
  const candidate=(configured??'').trim()
  if(!candidate)return systemTimeZone()
  try{formatter(candidate)}catch{throw new Error(`时区配置无效：${candidate}。请填写 IANA 时区名，例如 Asia/Shanghai`)}
  return candidate
}

/** Current UTC time in the storage format used by `CURRENT_TIMESTAMP`. */
export function utcTimestamp(date=new Date()){return `${date.toISOString().slice(0,19).replace('T',' ')}`}

/** Format any instant in the display time zone using the same shape as stored values. */
export function localTimestamp(date=new Date(),timeZone=systemTimeZone()){return assemble(zoneParts(date,timeZone))}

/** Convert a stored UTC timestamp to display time zone text; returns null when the value is not a timestamp. */
export function toLocalTimestamp(value:string|null|undefined,timeZone=systemTimeZone()):string|null{
  if(!value)return null
  const match=TIMESTAMP_PATTERN.exec(value.trim())
  if(!match)return null
  const utc=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),Number(match[4]),Number(match[5]),Number(match[6]))
  if(Number.isNaN(utc))return null
  return assemble(zoneParts(new Date(utc),timeZone))
}

/** Offset of the display zone against UTC in minutes, for clients that render without Intl support. */
export function timeZoneOffsetMinutes(timeZone=systemTimeZone(),date=new Date()){
  const parts=zoneParts(date,timeZone),asUtc=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second))
  return Math.round((asUtc-Math.floor(date.getTime()/1000)*1000)/60000)
}

/** `yyyyMMdd_HHmm` batch label, generated in the display time zone so it matches the time admin users see. */
export function batchStamp(date=new Date(),timeZone=systemTimeZone()){
  const parts=zoneParts(date,timeZone)
  return `${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}`
}
