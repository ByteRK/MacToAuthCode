import{mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{afterEach,describe,expect,it}from'vitest'
import{Database}from'../server/db/database.js'
import{AuditArchiveService}from'../server/services/audit-archive-service.js'

describe('audit log archiving',()=>{
  const dirs:string[]=[]
  afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true})})
  it('keeps 90 days live and exposes older monthly databases as read-only sources',()=>{
    const dir=mkdtempSync(join(tmpdir(),'audit-archive-test-'));dirs.push(dir);const database=new Database(join(dir,'main.db'))
    const old=database.raw.prepare("INSERT INTO audit_logs(action,entity_type,pid,did,message,created_at) VALUES('created','auth_code','OLD',?,'old row','2026-01-15 10:00:00')")
    database.transaction(()=>{for(let index=0;index<501;index++)old.run(`D${index}`)})
    database.raw.prepare("INSERT INTO audit_logs(action,entity_type,pid,did,message,created_at) VALUES('updated','auth_code','CURRENT','D2','current row','2026-04-15 10:00:00')").run()
    const service=new AuditArchiveService(database,dir),result=service.archive(new Date('2026-04-20T00:00:00Z'))
    expect(result.archived).toBe(501);expect(service.archives()).toMatchObject([{file:'audit-2026-01.db',count:501}])
    expect(service.list('audit-2026-01.db',50,'created','OLD')[0]).toMatchObject({pid:'OLD',did:'D500',message:'old row'})
    expect((database.raw.prepare('SELECT pid FROM audit_logs').all() as {pid:string}[]).map(row=>row.pid)).toEqual(['CURRENT'])
    expect(()=>service.list('../main.db')).toThrow('不存在');database.close()
  })
})
