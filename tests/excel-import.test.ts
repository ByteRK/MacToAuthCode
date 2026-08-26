import{mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{afterEach,beforeEach,describe,expect,it}from'vitest'
import*as XLSX from'xlsx'
import{Database}from'../server/db/database.js'
import{AuthCodeRepository}from'../server/repositories/auth-code-repository.js'
import{AuditService}from'../server/services/audit-service.js'
import{ExcelService}from'../server/services/excel-service.js'

function workbook(rows:Record<string,string>[]){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),'codes');return XLSX.write(book,{type:'buffer',bookType:'xlsx'})as Buffer}

describe('Excel inventory import',()=>{
  let dir:string,database:Database,repo:AuthCodeRepository,service:ExcelService
  beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'auth-excel-test-'));database=new Database(join(dir,'db.sqlite'));repo=new AuthCodeRepository(database);service=new ExcelService(repo,new AuditService(database))})
  afterEach(()=>{database.close();rmSync(dir,{recursive:true,force:true})})

  it('previews duplicate status and imports only unique rows with generated batch and custom payload',()=>{
    repo.create({pid:'P1',did:'D1',license:'OLD-1',payload:{}})
    repo.create({pid:'P2',did:'D2',license:'OLD-2',payload:{}});repo.claimNext('P2','AA:BB:CC:11:22:33')
    const file=workbook([{pid:'P1',did:'D1',license:'NEW-1',model:'A'},{pid:'P2',did:'D2',license:'NEW-2',model:'B'},{pid:'P3',did:'D3',license:'NEW-3',model:'C'},{pid:'P3',did:'D3',license:'NEW-3',model:'C'}])
    const preview=service.preview(file)
    expect(preview).toMatchObject({totalRows:4,validCount:1,duplicateCount:3})
    expect(preview.sourceBatch).toMatch(/^\d{8}_\d{4}$/)
    expect(preview.duplicates.map(item=>item.duplicateLabel)).toEqual(['未分配','已分配','导入文件内'])
    const result=service.import(file,preview.sourceBatch)
    expect(result).toMatchObject({inserted:1,skipped:3,sourceBatch:preview.sourceBatch})
    expect(repo.findByPidDid('P3','D3')).toMatchObject({sourceBatch:preview.sourceBatch,payload:{did:'D3',license:'NEW-3',model:'C'}})
  })

  it('creates a template containing only pid, did and license columns',()=>{
    const book=XLSX.read(service.template(),{type:'buffer'});const rows=XLSX.utils.sheet_to_json<Record<string,string>>(book.Sheets[book.SheetNames[0]])
    expect(Object.keys(rows[0])).toEqual(['pid','did','license'])
  })

  it('uses the page PID only when the workbook has no pid column',()=>{
    const file=workbook([{did:'D10',license:'L10',model:'gateway'}])
    expect(()=>service.preview(file)).toThrow('导入文件缺少必填列：pid')
    const preview=service.preview(file,'BATCH-1','PAGE-PID')
    expect(preview).toMatchObject({validCount:1,sourceBatch:'BATCH-1'})
    service.import(file,'BATCH-1','PAGE-PID')
    expect(repo.findByPidDid('PAGE-PID','D10')).toMatchObject({license:'L10',payload:{did:'D10',license:'L10',model:'gateway'}})
    service.import(workbook([{pid:'FILE-PID',did:'D11',license:'L11'}]),'BATCH-2','PAGE-PID')
    expect(repo.findByPidDid('FILE-PID','D11')).not.toBeNull()
    expect(repo.findByPidDid('PAGE-PID','D11')).toBeNull()
  })
})
