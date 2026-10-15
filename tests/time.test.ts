import{describe,expect,it}from'vitest'
import{batchStamp,localTimestamp,resolveTimeZone,systemTimeZone,timeZoneOffsetMinutes,toLocalTimestamp,utcTimestamp}from'../server/domain/time.js'

describe('timestamp display conversion',()=>{
  it('writes stored timestamps in the CURRENT_TIMESTAMP shape',()=>{
    expect(utcTimestamp(new Date('2026-10-15T07:05:06.789Z'))).toBe('2026-10-15 07:05:06')
  })

  it('renders stored UTC timestamps in the display zone',()=>{
    expect(toLocalTimestamp('2026-10-15 07:05:06','Asia/Shanghai')).toBe('2026-10-15 15:05:06')
    expect(toLocalTimestamp('2026-01-15 20:05:06','Asia/Shanghai')).toBe('2026-01-16 04:05:06')
    expect(localTimestamp(new Date('2026-10-15T07:05:06Z'),'Asia/Shanghai')).toBe('2026-10-15 15:05:06')
    expect(toLocalTimestamp('2026-10-15T07:05:06','UTC')).toBe('2026-10-15 07:05:06')
  })

  it('returns null instead of mangling unusable values',()=>{
    expect(toLocalTimestamp(null,'Asia/Shanghai')).toBeNull()
    expect(toLocalTimestamp('   ','Asia/Shanghai')).toBeNull()
    expect(toLocalTimestamp('not-a-time','Asia/Shanghai')).toBeNull()
  })

  it('generates batch labels in the display zone',()=>{
    expect(batchStamp(new Date('2026-10-15T07:05:06Z'),'Asia/Shanghai')).toBe('20261015_1505')
  })

  it('reports the zone offset and rejects invalid zone names',()=>{
    expect(timeZoneOffsetMinutes('Asia/Shanghai',new Date('2026-10-15T07:05:06Z'))).toBe(480)
    expect(timeZoneOffsetMinutes('UTC',new Date('2026-10-15T07:05:06Z'))).toBe(0)
    expect(resolveTimeZone('Asia/Shanghai')).toBe('Asia/Shanghai')
    expect(resolveTimeZone('')).toBe(systemTimeZone())
    expect(resolveTimeZone(undefined)).toBe(systemTimeZone())
    expect(()=>resolveTimeZone('Not/AZone')).toThrow('时区配置无效')
  })
})
