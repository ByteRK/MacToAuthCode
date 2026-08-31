import { Database } from '../db/database.js'
import { queryLogs } from './audit-archive-service.js'
export class AuditService {
  constructor(private database: Database) {}
  record(data: { action:string; entityType?:string; entityId?:number|null; pid?:string|null; mac?:string|null; did?:string|null; clientIp?:string|null; message:string; snapshot?:unknown }) {
    this.database.raw.prepare('INSERT INTO audit_logs(action,entity_type,entity_id,pid,mac,did,client_ip,message,snapshot_json) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(data.action,data.entityType??'auth_code',data.entityId??null,data.pid??null,data.mac??null,data.did??null,data.clientIp??null,data.message,data.snapshot===undefined?null:JSON.stringify(data.snapshot))
  }
  list(limit=50, actions:string[]|string='all', search='') {
    return queryLogs(this.database.raw,limit,actions,search)
  }
}
