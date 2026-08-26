import * as XLSX from 'xlsx'
import { AuthCodeRepository } from '../repositories/auth-code-repository.js'
import { AuditService } from './audit-service.js'
import { normalizePid } from '../domain/normalize.js'

const pidHeaders=new Set(['pid','product_pid','产品pid','产品id']); const batchHeaders=new Set(['batch','source_batch','批次'])
export class ExcelService {
  constructor(private repo:AuthCodeRepository,private audit:AuditService){}
  import(buffer:Buffer,defaultPid='') {
    const workbook=XLSX.read(buffer,{type:'buffer'});const sheet=workbook.Sheets[workbook.SheetNames[0]];if(!sheet)throw new Error('Excel 中没有工作表')
    const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:''});if(!rows.length)throw new Error('Excel 中没有可导入的数据')
    const parsed:{row:number;pid:string;did:string;license:string;sourceBatch:string|null;payload:Record<string,string>}[]=[];const errors:string[]=[]
    rows.forEach((raw,index)=>{try{let pid=defaultPid.trim(),sourceBatch='';const payload:Record<string,string>={};for(const [header,value] of Object.entries(raw)){const key=header.trim();const normalized=key.toLowerCase();const text=String(value??'').trim();if(pidHeaders.has(normalized)){pid=text||pid;continue}if(batchHeaders.has(normalized)){sourceBatch=text;continue}if(text)payload[key]=text}pid=normalizePid(pid);const did=this.pick(payload,'did');const license=this.pick(payload,'license');if(!did||!license)throw new Error('每条记录必须同时包含 did 和 license');parsed.push({row:index+2,pid,did,license,sourceBatch:sourceBatch||null,payload})}catch(error){errors.push(`第 ${index+2} 行：${(error as Error).message}`)}})
    if(errors.length) return {ok:false as const,errors}
    return this.repo.database.transaction(()=>{let inserted=0,skipped=0;const conflicts:string[]=[];for(const item of parsed){try{const record=this.repo.create(item);inserted++;this.audit.record({action:'imported',entityId:record.id,pid:record.pid,did:record.did,message:'Excel 导入授权码'})}catch(error){if(String(error).includes('UNIQUE')){skipped++;conflicts.push(`${item.pid} / ${item.did}`)}else throw error}}return {ok:true as const,totalRows:parsed.length,inserted,skipped,conflicts}})
  }
  template(){return this.workbook([{pid:'P1001',did:'DID-DEMO-001',license:'LICENSE-DEMO-001',source_batch:'BATCH-01'}],'auth_codes_template')}
  exportAssigned(){const rows=this.repo.list({page:1,pageSize:1_000_000,status:'assigned'}).items.map((x)=>({pid:x.pid,did:x.did,mac:x.assignedMac,source_batch:x.sourceBatch,assigned_at:x.assignedAt,...x.payload}));return this.workbook(rows,'assigned_codes')}
  exportLogs(){const rows=(this.audit.list(1_000_000) as Record<string,unknown>[]);return this.workbook(rows,'audit_logs')}
  private pick(payload:Record<string,string>,name:string){return Object.entries(payload).find(([key])=>key.toLowerCase()===name)?.[1]??''}
  private workbook(rows:unknown[],name:string){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),name);return XLSX.write(book,{type:'buffer',bookType:'xlsx'}) as Buffer}
}
