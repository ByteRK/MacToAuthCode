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
  options(){return this.database.raw.prepare(`SELECT c.pid,COALESCE(m.remark,'') remark FROM auth_codes c LEFT JOIN pid_metadata m ON m.pid=c.pid GROUP BY c.pid,m.remark ORDER BY c.pid COLLATE NOCASE ASC,c.pid ASC`).all() as{pid:string;remark:string}[]}
  updateRemark(pidInput:string,remarkInput:string){
    const pid=normalizePid(pidInput),remark=remarkInput.trim()
    if(remark.length>200)throw new Error('产品备注长度不能超过 200 个字符')
    const before=this.database.raw.prepare('SELECT remark FROM pid_metadata WHERE pid=?').get(pid) as {remark:string}|undefined
    this.database.raw.prepare(`INSERT INTO pid_metadata(pid,remark,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(pid) DO UPDATE SET remark=excluded.remark,updated_at=CURRENT_TIMESTAMP`).run(pid,remark)
    this.audit.record({action:'updated',entityType:'pid',pid,message:'更新 PID 产品备注',snapshot:{before:before?.remark??'',after:remark}})
    return {pid,remark}
  }
  importRemarks(buffer:Buffer){
    let parsed:unknown;try{parsed=JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/,''))}catch{throw new Error('产品备注文件不是有效的 JSON')}
    if(!Array.isArray(parsed))throw new Error('产品备注 JSON 顶层必须是数组')
    const rows:{pid:string;remark:string}[]=[],seen=new Set<string>(),errors:string[]=[]
    parsed.forEach((value,index)=>{try{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('必须是包含 pid 和 remark 的对象');const item=value as Record<string,unknown>;if(typeof item.pid!=='string'||typeof item.remark!=='string')throw new Error('pid 和 remark 必须是字符串');const pid=normalizePid(item.pid),remark=item.remark.trim();if(remark.length>200)throw new Error('remark 长度不能超过 200 个字符');if(seen.has(pid))throw new Error(`PID ${pid} 重复`);seen.add(pid);rows.push({pid,remark})}catch(error){errors.push(`第 ${index+1} 项：${(error as Error).message}`)}})
    if(errors.length){const error=new Error('产品备注文件校验失败') as Error&{details?:string[]};error.details=errors;throw error}
    return this.database.transaction(()=>{let created=0,updated=0,unchanged=0;const select=this.database.raw.prepare('SELECT remark FROM pid_metadata WHERE pid=?'),upsert=this.database.raw.prepare(`INSERT INTO pid_metadata(pid,remark,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(pid) DO UPDATE SET remark=excluded.remark,updated_at=CURRENT_TIMESTAMP`);for(const row of rows){const before=select.get(row.pid) as{remark:string}|undefined;if(!before)created++;else if(before.remark===row.remark){unchanged++;continue}else updated++;upsert.run(row.pid,row.remark)}return{total:rows.length,created,updated,unchanged}})
  }
  exportRemarks(){return Buffer.from(JSON.stringify(this.database.raw.prepare('SELECT pid,remark FROM pid_metadata ORDER BY pid COLLATE NOCASE ASC,pid ASC').all(),null,2),'utf8')}
}
