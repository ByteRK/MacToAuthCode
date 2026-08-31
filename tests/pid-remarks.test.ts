import{mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{afterEach,describe,expect,it}from'vitest'
import{Database}from'../server/db/database.js'
import{AuditService}from'../server/services/audit-service.js'
import{PidService}from'../server/services/pid-service.js'

describe('PID remark JSON transfer',()=>{const dirs:string[]=[];afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true})});it('imports remarks independently while the PID list only exposes inventory PIDs',()=>{const dir=mkdtempSync(join(tmpdir(),'pid-remarks-test-'));dirs.push(dir);const database=new Database(join(dir,'db.sqlite')),audit=new AuditService(database),service=new PidService(database,audit);const first=service.importRemarks(Buffer.from(JSON.stringify([{pid:'ONLY-REMARK',remark:'独立产品'},{pid:'P2',remark:'产品二'}])));expect(first).toEqual({total:2,created:2,updated:0,unchanged:0});expect(service.list({page:1,pageSize:20,search:''}).items).toEqual([]);expect(audit.list(10)).toEqual([]);database.raw.prepare("INSERT INTO auth_codes(pid,did,license,payload_json) VALUES('P2','D2','L2','{}')").run();expect(service.list({page:1,pageSize:20,search:''}).items).toMatchObject([{pid:'P2',remark:'产品二',totalCodes:1}]);expect(service.importRemarks(Buffer.from(JSON.stringify([{pid:'P2',remark:'产品二（新）'}])))).toEqual({total:1,created:0,updated:1,unchanged:0});expect(JSON.parse(service.exportRemarks().toString())).toEqual([{pid:'ONLY-REMARK',remark:'独立产品'},{pid:'P2',remark:'产品二（新）'}]);expect(()=>service.importRemarks(Buffer.from('[{"pid":"P1","remark":1}]'))).toThrow('校验失败');database.close()})})
