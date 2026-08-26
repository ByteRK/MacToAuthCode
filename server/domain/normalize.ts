export function normalizeMac(value: string): string {
  const compact = value.trim().toUpperCase().replaceAll('-', '').replaceAll(':', '')
  if (!/^[0-9A-F]{12}$/.test(compact)) throw new Error('MAC 地址格式不正确')
  return compact.match(/.{2}/g)!.join(':')
}

export function normalizePid(value: string): string {
  const pid = value.trim()
  if (!pid) throw new Error('PID 不能为空')
  if (pid.length > 100) throw new Error('PID 长度不能超过 100')
  return pid
}

export function escapeLike(value: string) { return value.replace(/[\\%_]/g, '\\$&') }
