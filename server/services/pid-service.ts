import { Database } from '../db/database.js'
import { escapeLike,normalizePid } from '../domain/normalize.js'
import { AuditService } from './audit-service.js'

export class PidService {
  constructor(private database:Database,private audit:AuditService){}
  list(query:{page:number;pageSize:number;search:string}){
    const search=query.search.trim(),where=search?"WHERE c.pid LIKE ? ESCAPE '\\' OR COALESCE(m.remark,'') LIKE ? ESCAPE '\\'":''
    const params=search?[`%${escapeLike(search)}%`,`%${escapeLike(search)}%`]:[]
    const total=Number((this.database.raw.prepare(`SELECT COUNT(DISTINCT c.pid) total FROM auth_codes c LEFT JOIN pid_metadata m ON m.pid=c.pid ${where}`).get(...params) as {total:number}).total)
    const items=this.database.raw.prepare(`SELECT c.pid,COALESCE(m.remark,'') remark,COUNT(*) totalCodes,
      SUM(c.status='available') availableCodes,SUM(c.status='assigned') assignedCodes,
      MAX(c.updated_at) lastDataAt,m.updated_at remarkUpdatedAt
      FROM auth_codes c LEFT JOIN pid_metadata m ON m.pid=c.pid ${where}
      GROUP BY c.pid,m.remark,m.updated_at ORDER BY c.pid COLLATE NOCASE ASC,c.pid ASC LIMIT ? OFFSET ?`).all(...params,query.pageSize,(query.page-1)*query.pageSize)
    return {items,total,page:query.page,pageSize:query.pageSize}
  }
  updateRemark(pidInput:string,remarkInput:string){
    const pid=normalizePid(pidInput),remark=remarkInput.trim()
    if(!this.database.raw.prepare('SELECT 1 FROM auth_codes WHERE pid=? LIMIT 1').get(pid))throw new Error('PID 不存在')
    const before=this.database.raw.prepare('SELECT remark FROM pid_metadata WHERE pid=?').get(pid) as {remark:string}|undefined
    this.database.raw.prepare(`INSERT INTO pid_metadata(pid,remark,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(pid) DO UPDATE SET remark=excluded.remark,updated_at=CURRENT_TIMESTAMP`).run(pid,remark)
    this.audit.record({action:'updated',entityType:'pid',pid,message:'更新 PID 产品备注',snapshot:{before:before?.remark??'',after:remark}})
    return {pid,remark}
  }
}
