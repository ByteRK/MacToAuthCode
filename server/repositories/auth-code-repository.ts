import type { AuthCodeRecord, CodeStatus, PageResult } from '../../shared/contracts.js'
import { Database } from '../db/database.js'
import { escapeLike } from '../domain/normalize.js'

type DbRow = Record<string, unknown>
const decode = (row: DbRow): AuthCodeRecord => ({
  id: Number(row.id), pid: String(row.pid), pidRemark:row.pid_remark?String(row.pid_remark):'', did: String(row.did), license: String(row.license),
  payload: JSON.parse(String(row.payload_json)), sourceBatch: row.source_batch ? String(row.source_batch) : null,
  status: String(row.status) as CodeStatus, assignedMac: row.assigned_mac ? String(row.assigned_mac) : null,
  assignedAt: row.assigned_at ? String(row.assigned_at) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
})

export class AuthCodeRepository {
  constructor(readonly database: Database) {}
  findAssigned(pid: string, mac: string) {
    const row = this.database.raw.prepare('SELECT * FROM auth_codes WHERE pid=? AND assigned_mac=? LIMIT 1').get(pid, mac) as DbRow | undefined
    return row ? decode(row) : null
  }
  claimNext(pid: string, mac: string) {
    const row = this.database.raw.prepare("SELECT id FROM auth_codes WHERE pid=? AND status='available' ORDER BY id LIMIT 1").get(pid) as { id: number } | undefined
    if (!row) return null
    const changed = this.database.raw.prepare("UPDATE auth_codes SET status='assigned', assigned_mac=?, assigned_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='available'").run(mac, row.id)
    if (changed.changes !== 1) return null
    return this.get(row.id)
  }
  get(id: number) { const row = this.database.raw.prepare('SELECT * FROM auth_codes WHERE id=?').get(id) as DbRow | undefined; return row ? decode(row) : null }
  create(input: { pid: string; did: string; license: string; payload: Record<string,string>; sourceBatch?: string | null }) {
    const payload = { ...input.payload, did: input.did, license: input.license }
    const result = this.database.raw.prepare('INSERT INTO auth_codes(pid,did,license,payload_json,source_batch) VALUES(?,?,?,?,?)').run(input.pid, input.did, input.license, JSON.stringify(payload), input.sourceBatch ?? null)
    return this.get(Number(result.lastInsertRowid))!
  }
  update(id: number, input: { pid: string; did: string; license: string; payload: Record<string,string>; sourceBatch?: string | null }) {
    const payload = { ...input.payload, did: input.did, license: input.license }
    this.database.raw.prepare('UPDATE auth_codes SET pid=?,did=?,license=?,payload_json=?,source_batch=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(input.pid,input.did,input.license,JSON.stringify(payload),input.sourceBatch ?? null,id)
    return this.get(id)
  }
  unbind(id: number) { this.database.raw.prepare("UPDATE auth_codes SET status='available',assigned_mac=NULL,assigned_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id); return this.get(id) }
  delete(id: number) { return this.database.raw.prepare('DELETE FROM auth_codes WHERE id=?').run(id).changes === 1 }
  list(query: { page:number; pageSize:number; search?:string; status?:string; pid?:string }): PageResult<AuthCodeRecord> {
    const clauses:string[]=[]; const params:(string|number)[]=[]
    if (query.pid) { clauses.push('pid=?'); params.push(query.pid) }
    if (query.status === 'available' || query.status === 'assigned') { clauses.push('status=?'); params.push(query.status) }
    if (query.search) { const key=`%${escapeLike(query.search)}%`; clauses.push("(pid LIKE ? ESCAPE '\\' OR did LIKE ? ESCAPE '\\' OR assigned_mac LIKE ? ESCAPE '\\' OR payload_json LIKE ? ESCAPE '\\')"); params.push(key,key,key,key) }
    const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:''; const offset=(query.page-1)*query.pageSize
    const total=Number((this.database.raw.prepare(`SELECT COUNT(*) total FROM auth_codes ${where}`).get(...params) as {total:number}).total)
    const rows=this.database.raw.prepare(`SELECT *,COALESCE((SELECT remark FROM pid_metadata WHERE pid=auth_codes.pid),'') pid_remark FROM auth_codes ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params,query.pageSize,offset) as DbRow[]
    return { items: rows.map(decode), total, page:query.page, pageSize:query.pageSize }
  }
  listAllocations(query:{page:number;pageSize:number;search?:string}):PageResult<AuthCodeRecord>{
    const params:string[]=[];let filter=''
    if(query.search?.trim()){const key=`%${escapeLike(query.search.trim())}%`;filter="AND (pid LIKE ? ESCAPE '\\' OR did LIKE ? ESCAPE '\\' OR assigned_mac LIKE ? ESCAPE '\\' OR payload_json LIKE ? ESCAPE '\\')";params.push(key,key,key,key)}
    const total=Number((this.database.raw.prepare(`SELECT COUNT(*) total FROM auth_codes WHERE status='assigned' ${filter}`).get(...params) as {total:number}).total)
    const rows=this.database.raw.prepare(`SELECT *,COALESCE((SELECT remark FROM pid_metadata WHERE pid=auth_codes.pid),'') pid_remark
      FROM auth_codes WHERE status='assigned' ${filter} ORDER BY assigned_at DESC,id DESC LIMIT ? OFFSET ?`).all(...params,query.pageSize,(query.page-1)*query.pageSize) as DbRow[]
    return {items:rows.map(decode),total,page:query.page,pageSize:query.pageSize}
  }
  summary() {
    const row=this.database.raw.prepare("SELECT COUNT(*) totalCodes,COUNT(DISTINCT pid) pidCount,SUM(status='available') availableCodes,SUM(status='assigned') assignedCodes FROM auth_codes").get() as DbRow
    const requests=(this.database.raw.prepare("SELECT COUNT(*) count FROM audit_logs WHERE action IN ('assigned','reused','exhausted')").get() as {count:number}).count
    return { totalCodes:Number(row.totalCodes),pidCount:Number(row.pidCount),availableCodes:Number(row.availableCodes??0),assignedCodes:Number(row.assignedCodes??0),distributionRequests:Number(requests) }
  }
}
