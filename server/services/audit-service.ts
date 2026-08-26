import { Database } from '../db/database.js'
export class AuditService {
  constructor(private database: Database) {}
  record(data: { action:string; entityType?:string; entityId?:number|null; pid?:string|null; mac?:string|null; did?:string|null; clientIp?:string|null; message:string; snapshot?:unknown }) {
    this.database.raw.prepare('INSERT INTO audit_logs(action,entity_type,entity_id,pid,mac,did,client_ip,message,snapshot_json) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(data.action,data.entityType??'auth_code',data.entityId??null,data.pid??null,data.mac??null,data.did??null,data.clientIp??null,data.message,data.snapshot===undefined?null:JSON.stringify(data.snapshot))
  }
  list(limit=50, action='all', search='') {
    const clauses:string[]=[]; const params:string[]=[]
    if(action!=='all'){clauses.push('action=?');params.push(action)}
    if(search){clauses.push('(pid LIKE ? OR mac LIKE ? OR did LIKE ?)');params.push(`%${search}%`,`%${search}%`,`%${search}%`)}
    const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:''
    return this.database.raw.prepare(`SELECT id,action,entity_type entityType,entity_id entityId,pid,
      COALESCE((SELECT remark FROM pid_metadata WHERE pid=audit_logs.pid),'') pidRemark,
      mac,did,client_ip clientIp,message,snapshot_json snapshotJson,created_at createdAt
      FROM audit_logs ${where} ORDER BY id DESC LIMIT ?`).all(...params,limit)
  }
}
