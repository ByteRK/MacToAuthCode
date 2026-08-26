import * as XLSX from 'xlsx'
import { AuthCodeRepository } from '../repositories/auth-code-repository.js'
import { AuditService } from './audit-service.js'
import { normalizePid } from '../domain/normalize.js'

interface ImportRow { row:number;pid:string;did:string;license:string;sourceBatch:string;payload:Record<string,string> }
export interface ImportDuplicate { row:number;pid:string;did:string;duplicateWith:'available'|'assigned'|'file';duplicateLabel:'未分配'|'已分配'|'导入文件内' }
export interface ImportPreview { totalRows:number;validCount:number;duplicateCount:number;sourceBatch:string;duplicates:ImportDuplicate[] }

const requiredHeaders=['pid','did','license'] as const

export class ExcelService {
  constructor(private repo:AuthCodeRepository,private audit:AuditService){}

  preview(buffer:Buffer,sourceBatch='',defaultPid=''):ImportPreview {
    const {rows,batch}=this.parse(buffer,sourceBatch,defaultPid)
    const {valid,duplicates}=this.partition(rows)
    return {totalRows:rows.length,validCount:valid.length,duplicateCount:duplicates.length,sourceBatch:batch,duplicates}
  }

  import(buffer:Buffer,sourceBatch='',defaultPid='') {
    const {rows,batch}=this.parse(buffer,sourceBatch,defaultPid)
    return this.repo.database.transaction(()=>{
      // Inventory may have changed after preview, so conflicts are checked again in the write transaction.
      const {valid,duplicates}=this.partition(rows)
      for(const item of valid){
        const record=this.repo.create(item)
        this.audit.record({action:'imported',entityId:record.id,pid:record.pid,did:record.did,message:'Excel 导入授权码'})
      }
      return {ok:true as const,totalRows:rows.length,inserted:valid.length,skipped:duplicates.length,sourceBatch:batch,duplicates}
    })
  }

  template(){return this.workbook([{pid:'P1001',did:'DID-DEMO-001',license:'LICENSE-DEMO-001'}],'auth_codes_template')}
  exportAssigned(){const rows=this.repo.list({page:1,pageSize:1_000_000,status:'assigned'}).items.map((x)=>({pid:x.pid,did:x.did,mac:x.assignedMac,source_batch:x.sourceBatch,assigned_at:x.assignedAt,...x.payload}));return this.workbook(rows,'assigned_codes')}
  exportLogs(){const rows=(this.audit.list(1_000_000) as Record<string,unknown>[]);return this.workbook(rows,'audit_logs')}

  private parse(buffer:Buffer,sourceBatch:string,defaultPid:string){
    const workbook=XLSX.read(buffer,{type:'buffer'});const sheet=workbook.Sheets[workbook.SheetNames[0]]
    if(!sheet)throw new Error('Excel 中没有工作表')
    const rawRows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:''})
    if(!rawRows.length)throw new Error('Excel 中没有可导入的数据')
    const headerMap=new Map(Object.keys(rawRows[0]).map(header=>[header.trim().toLowerCase(),header]))
    const missing=requiredHeaders.filter(header=>!headerMap.has(header)&&!(header==='pid'&&defaultPid.trim()))
    if(missing.length)throw new Error(`导入文件缺少必填列：${missing.join('、')}`)
    const batch=sourceBatch.trim()||this.currentBatch()
    const rows:ImportRow[]=[];const errors:string[]=[]
    rawRows.forEach((raw,index)=>{try{
      const core=Object.fromEntries(requiredHeaders.map(name=>[name,name==='pid'&&!headerMap.has(name)?defaultPid.trim():String(raw[headerMap.get(name)!]??'').trim()])) as Record<typeof requiredHeaders[number],string>
      const pid=normalizePid(core.pid);if(!core.did)throw new Error('did 不能为空');if(!core.license)throw new Error('license 不能为空')
      const payload:Record<string,string>={}
      for(const [header,value] of Object.entries(raw)){if(requiredHeaders.includes(header.trim().toLowerCase() as typeof requiredHeaders[number]))continue;payload[header.trim()]=String(value??'').trim()}
      rows.push({row:index+2,pid,did:core.did,license:core.license,sourceBatch:batch,payload})
    }catch(error){errors.push(`第 ${index+2} 行：${(error as Error).message}`)}})
    if(errors.length){const error=new Error('导入校验失败') as Error&{details?:string[]};error.details=errors;throw error}
    return {rows,batch}
  }

  private partition(rows:ImportRow[]){
    const valid:ImportRow[]=[];const duplicates:ImportDuplicate[]=[];const seen=new Set<string>()
    for(const item of rows){
      const key=`${item.pid}\u0000${item.did}`;const existing=this.repo.findByPidDid(item.pid,item.did)
      if(existing){duplicates.push({row:item.row,pid:item.pid,did:item.did,duplicateWith:existing.status,duplicateLabel:existing.status==='assigned'?'已分配':'未分配'});continue}
      if(seen.has(key)){duplicates.push({row:item.row,pid:item.pid,did:item.did,duplicateWith:'file',duplicateLabel:'导入文件内'});continue}
      seen.add(key);valid.push(item)
    }
    return {valid,duplicates}
  }

  private currentBatch(){const now=new Date();const part=(value:number)=>String(value).padStart(2,'0');return `${now.getFullYear()}${part(now.getMonth()+1)}${part(now.getDate())}_${part(now.getHours())}${part(now.getMinutes())}`}
  private workbook(rows:unknown[],name:string){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),name);return XLSX.write(book,{type:'buffer',bookType:'xlsx'}) as Buffer}
}
