import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { AuthCodeRepository } from '../repositories/auth-code-repository.js'
import { AuditService } from './audit-service.js'

interface LegacyRow {
  pid:string; did:string; license:string; payload_json:string; source_batch:string|null
  status:string; assigned_mac:string|null; assigned_at:string|null; created_at:string|null; updated_at:string|null
}

export class MigrationService {
  constructor(private repo:AuthCodeRepository,private audit:AuditService){}
  migrate(buffer:Buffer){const dir=mkdtempSync(join(tmpdir(),'auth-migration-'));const path=join(dir,'legacy.db');writeFileSync(path,buffer);let old:DatabaseSync|undefined
    try{old=new DatabaseSync(path,{readOnly:true});const columns=old.prepare('PRAGMA table_info(auth_codes)').all() as {name:string}[];const required=['pid','did','license','payload_json','status'];if(!required.every(key=>columns.some(c=>c.name===key)))throw new Error('不是受支持的旧版授权数据库')
      const rows=old.prepare('SELECT pid,did,license,payload_json,source_batch,status,assigned_mac,assigned_at,created_at,updated_at FROM auth_codes ORDER BY id').all() as unknown as LegacyRow[]
      return this.repo.database.transaction(()=>{let inserted=0,skipped=0;const conflicts:string[]=[];for(const row of rows){try{const payload=JSON.parse(String(row.payload_json||'{}'));const result=this.repo.database.raw.prepare('INSERT INTO auth_codes(pid,did,license,payload_json,source_batch,status,assigned_mac,assigned_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(String(row.pid),String(row.did),String(row.license),JSON.stringify(payload),row.source_batch??null,row.status==='assigned'?'assigned':'available',row.assigned_mac??null,row.assigned_at??null,row.created_at??new Date().toISOString(),row.updated_at??new Date().toISOString());inserted++;this.audit.record({action:'migrated',entityId:Number(result.lastInsertRowid),pid:String(row.pid),did:String(row.did),message:'从旧版数据库迁移授权记录'})}catch(error){if(String(error).includes('UNIQUE')){skipped++;conflicts.push(`${row.pid} / ${row.did}`)}else throw error}}return {totalRows:rows.length,inserted,skipped,conflicts}})
    }finally{old?.close();rmSync(dir,{recursive:true,force:true})}}
}
