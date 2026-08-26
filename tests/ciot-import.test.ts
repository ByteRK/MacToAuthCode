import{mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{afterEach,beforeEach,describe,expect,it}from'vitest'
import*as XLSX from'xlsx'
import{Database}from'../server/db/database.js'
import{AuthCodeRepository}from'../server/repositories/auth-code-repository.js'
import{AuditService}from'../server/services/audit-service.js'
import{CiotImportService}from'../server/services/ciot-import-service.js'

const workbook=(rows:Record<string,string>[])=>{const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),'CIOT');return XLSX.write(book,{type:'buffer',bookType:'xlsx'})as Buffer}
const row=(sn:string,status='未激活')=>({申请表流水号:'ac-test',sn码:sn,许可证:`LICENSE-${sn}`,状态:status})

describe('CIOT source import',()=>{
  let dir:string,database:Database,repo:AuthCodeRepository,service:CiotImportService
  beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'auth-ciot-test-'));database=new Database(join(dir,'db.sqlite'));repo=new AuthCodeRepository(database);service=new CiotImportService(repo,new AuditService(database))})
  afterEach(()=>{database.close();rmSync(dir,{recursive:true,force:true})})
  it('maps sn and license without source-specific custom payload',()=>{const file=workbook([row('SN-1'),row('SN-2')]),preview=service.preview(file,'CIOT-PID','BATCH-1');expect(preview).toMatchObject({statusValid:true,totalRows:2,validCount:2,duplicateCount:0});service.import(file,'CIOT-PID','BATCH-1');expect(repo.findByPidDid('CIOT-PID','SN-1')).toMatchObject({license:'LICENSE-SN-1',sourceBatch:'BATCH-1',payload:{did:'SN-1',license:'LICENSE-SN-1'}})})
  it('rejects the entire file when any source status is not inactive',()=>{const file=workbook([row('SN-1'),row('SN-2','已激活')]),preview=service.preview(file,'CIOT-PID');expect(preview).toMatchObject({statusValid:false,validCount:0,invalidStatuses:[{row:3,did:'SN-2',status:'已激活'}]});expect(()=>service.import(file,'CIOT-PID')).toThrow('已拒绝整次导入');expect(repo.findByPidDid('CIOT-PID','SN-1')).toBeNull()})
  it('uses the standard duplicate preview after status validation',()=>{repo.create({pid:'CIOT-PID',did:'SN-1',license:'OLD',payload:{}});const preview=service.preview(workbook([row('SN-1'),row('SN-2'),row('SN-2')]),'CIOT-PID');expect(preview).toMatchObject({statusValid:true,validCount:1,duplicateCount:2});expect(preview.duplicates.map(item=>item.duplicateLabel)).toEqual(['未分配','导入文件内'])})
})
