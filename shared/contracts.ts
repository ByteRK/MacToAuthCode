export type CodeStatus = 'available' | 'assigned'
export type AuditAction = 'assigned' | 'reused' | 'exhausted' | 'created' | 'updated' | 'deleted' | 'unbound' | 'imported' | 'migrated'

export interface AuthCodeRecord {
  id: number
  pid: string
  did: string
  license: string
  payload: Record<string, string>
  sourceBatch: string | null
  status: CodeStatus
  assignedMac: string | null
  assignedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number }
export interface ApiResult<T = unknown> { success: boolean; message?: string; data?: T; errors?: string[] }
