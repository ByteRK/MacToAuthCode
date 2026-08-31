import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Database } from '../db/database.js'

const ARCHIVE_PATTERN=/^audit-(\d{4}-\d{2})\.db$/
const ARCHIVE_SCHEMA=`CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER,
  pid TEXT, pid_remark TEXT NOT NULL DEFAULT '', mac TEXT, did TEXT, client_ip TEXT,
  message TEXT NOT NULL, snapshot_json TEXT, created_at TEXT NOT NULL, UNIQUE(source_id,created_at)
); CREATE INDEX IF NOT EXISTS idx_archive_created ON audit_logs(created_at DESC,id DESC);`
type AuditRow=Record<string,string|number|bigint|null>

export class AuditArchiveService {
  readonly directory:string
  constructor(private database:Database,dataDir:string,private retentionDays=90){this.directory=join(dataDir,'audit-archives');mkdirSync(this.directory,{recursive:true})}
  /** Copy and commit first; only verified rows are then removed from the live database. */
  archive(now=new Date()){
    const cutoff=new Date(now.getTime()-this.retentionDays*86_400_000).toISOString().replace('T',' ').replace('Z','')
    const months=this.database.raw.prepare("SELECT DISTINCT substr(created_at,1,7) month FROM audit_logs WHERE created_at<? ORDER BY month").all(cutoff) as {month:string}[]
    let archived=0
    for(const {month} of months){if(/^\d{4}-\d{2}$/.test(month))archived+=this.archiveMonth(month,cutoff)}
    return {archived,cutoff,archives:this.archives()}
  }
  archives(){
    return readdirSync(this.directory).flatMap(file=>{const match=file.match(ARCHIVE_PATTERN);if(!match)return[];const db=new DatabaseSync(join(this.directory,file),{readOnly:true});try{const row=db.prepare('SELECT COUNT(*) count,MIN(created_at) oldestAt,MAX(created_at) newestAt FROM audit_logs').get() as AuditRow;return[{file,label:`${match[1]} 归档`,count:Number(row.count),oldestAt:row.oldestAt?String(row.oldestAt):null,newestAt:row.newestAt?String(row.newestAt):null}]}catch{return[]}finally{db.close()}}).sort((a,b)=>b.file.localeCompare(a.file))
  }
  list(file:string,limit=50,actions:string[]|string='all',search=''){
    const db=new DatabaseSync(this.resolveArchive(file),{readOnly:true});try{return queryLogs(db,limit,actions,search,true)}finally{db.close()}
  }
  private resolveArchive(file:string){if(!ARCHIVE_PATTERN.test(file)||!this.archives().some(item=>item.file===file))throw new Error('指定的日志归档数据库不存在');return join(this.directory,file)}
  private archiveMonth(month:string,cutoff:string){
    const archive=new DatabaseSync(join(this.directory,`audit-${month}.db`))
    try{
      archive.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=30000; ${ARCHIVE_SCHEMA}`)
      const insert=archive.prepare('INSERT OR IGNORE INTO audit_logs(source_id,action,entity_type,entity_id,pid,pid_remark,mac,did,client_ip,message,snapshot_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      const verify=archive.prepare('SELECT 1 copied FROM audit_logs WHERE source_id=? AND created_at=?')
      let archived=0
      while(true){
        const rows=this.database.raw.prepare(`SELECT id,action,entity_type,entity_id,pid,COALESCE((SELECT remark FROM pid_metadata WHERE pid=audit_logs.pid),'') pid_remark,mac,did,client_ip,message,snapshot_json,created_at FROM audit_logs WHERE created_at<? AND substr(created_at,1,7)=? ORDER BY id LIMIT 500`).all(cutoff,month) as AuditRow[]
        if(!rows.length)return archived
        archive.exec('BEGIN IMMEDIATE')
        try{for(const row of rows)insert.run(row.id,row.action,row.entity_type,row.entity_id,row.pid,row.pid_remark,row.mac,row.did,row.client_ip,row.message,row.snapshot_json,row.created_at);archive.exec('COMMIT')}catch(error){archive.exec('ROLLBACK');throw error}
        if(rows.some(row=>!verify.get(row.id,row.created_at)))throw new Error(`日志归档校验失败：${month}`)
        const ids=rows.map(row=>row.id),placeholders=ids.map(()=>'?').join(',')
        const deleted=this.database.transaction(()=>Number(this.database.raw.prepare(`DELETE FROM audit_logs WHERE id IN (${placeholders})`).run(...ids).changes))
        if(deleted!==rows.length)throw new Error(`日志归档主库清理校验失败：${month}`)
        archived+=deleted
      }
    }finally{archive.close()}
  }
}

export function queryLogs(db:DatabaseSync,limit=50,actions:string[]|string='all',search='',archived=false){
  const clauses:string[]=[],params:string[]=[]
  const selected=Array.isArray(actions)?actions:actions==='all'||!actions?[]:actions.split(',').map(item=>item.trim()).filter(Boolean)
  if(selected.length){clauses.push(`action IN (${selected.map(()=>'?').join(',')})`);params.push(...selected)}
  if(search){clauses.push('(pid LIKE ? OR mac LIKE ? OR did LIKE ?)');params.push(`%${search}%`,`%${search}%`,`%${search}%`)}
  const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:'',remark=archived?'pid_remark':"COALESCE((SELECT remark FROM pid_metadata WHERE pid=audit_logs.pid),'')",id='id'
  return db.prepare(`SELECT ${id} id,action,entity_type entityType,entity_id entityId,pid,${remark} pidRemark,mac,did,client_ip clientIp,message,snapshot_json snapshotJson,created_at createdAt FROM audit_logs ${where} ORDER BY ${id} DESC LIMIT ?`).all(...params,limit)
}
