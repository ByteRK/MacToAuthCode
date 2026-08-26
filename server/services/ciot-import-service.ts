import*as XLSX from'xlsx'
import{normalizePid}from'../domain/normalize.js'
import{AuthCodeRepository}from'../repositories/auth-code-repository.js'
import{AuditService}from'./audit-service.js'
import type{ImportDuplicate}from'./excel-service.js'

interface CiotRow{row:number;pid:string;did:string;license:string;sourceBatch:string;payload:Record<string,string>;sourceStatus:string}
export interface CiotInvalidStatus{row:number;did:string;status:string}

/** Dedicated adapter for CIOT authorization exports; keep its source-specific rules out of generic Excel import. */
export class CiotImportService{
  constructor(private repo:AuthCodeRepository,private audit:AuditService){}
  preview(buffer:Buffer,pidInput:string,sourceBatch=''){
    const{rows,batch}=this.parse(buffer,pidInput,sourceBatch),invalidStatuses=this.invalidStatuses(rows)
    if(invalidStatuses.length)return{statusValid:false,totalRows:rows.length,validCount:0,duplicateCount:0,sourceBatch:batch,duplicates:[]as ImportDuplicate[],invalidStatuses}
    const{valid,duplicates}=this.partition(rows)
    return{statusValid:true,totalRows:rows.length,validCount:valid.length,duplicateCount:duplicates.length,sourceBatch:batch,duplicates,invalidStatuses:[]as CiotInvalidStatus[]}
  }
  import(buffer:Buffer,pidInput:string,sourceBatch=''){
    const{rows,batch}=this.parse(buffer,pidInput,sourceBatch),invalidStatuses=this.invalidStatuses(rows)
    if(invalidStatuses.length)throw new Error(`存在 ${invalidStatuses.length} 条非“未激活”数据，已拒绝整次导入`)
    return this.repo.database.transaction(()=>{const{valid,duplicates}=this.partition(rows);for(const item of valid){const record=this.repo.create(item);this.audit.record({action:'imported',entityId:record.id,pid:record.pid,did:record.did,message:'CIOT 源导入授权码'})}return{ok:true as const,totalRows:rows.length,inserted:valid.length,skipped:duplicates.length,sourceBatch:batch,duplicates}})
  }
  private parse(buffer:Buffer,pidInput:string,sourceBatch:string){
    const pid=normalizePid(pidInput),book=XLSX.read(buffer,{type:'buffer'}),sheet=book.Sheets[book.SheetNames[0]]
    if(!sheet)throw new Error('Excel 中没有工作表')
    const rawRows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:''});if(!rawRows.length)throw new Error('Excel 中没有可导入的数据')
    const headers=new Map(Object.keys(rawRows[0]).map(header=>[header.trim(),header])),required=['申请表流水号','sn码','许可证','状态']
    const missing=required.filter(header=>!headers.has(header));if(missing.length)throw new Error(`CIOT 文件缺少必填列：${missing.join('、')}`)
    const batch=sourceBatch.trim()||this.currentBatch(),rows:CiotRow[]=[],errors:string[]=[]
    rawRows.forEach((raw,index)=>{const row=index+2,did=String(raw[headers.get('sn码')!]??'').trim(),license=String(raw[headers.get('许可证')!]??'').trim(),sourceStatus=String(raw[headers.get('状态')!]??'').trim();if(!did)errors.push(`第 ${row} 行：sn码不能为空`);if(!license)errors.push(`第 ${row} 行：许可证不能为空`);rows.push({row,pid,did,license,sourceBatch:batch,payload:{},sourceStatus})})
    if(errors.length){const error=new Error('CIOT 导入校验失败')as Error&{details?:string[]};error.details=errors;throw error}return{rows,batch}
  }
  private invalidStatuses(rows:CiotRow[]):CiotInvalidStatus[]{return rows.filter(item=>item.sourceStatus!=='未激活').map(item=>({row:item.row,did:item.did,status:item.sourceStatus||'空状态'}))}
  private partition(rows:CiotRow[]){const valid:CiotRow[]=[],duplicates:ImportDuplicate[]=[],seen=new Set<string>();for(const item of rows){const key=`${item.pid}\u0000${item.did}`,existing=this.repo.findByPidDid(item.pid,item.did);if(existing){duplicates.push({row:item.row,pid:item.pid,did:item.did,duplicateWith:existing.status,duplicateLabel:existing.status==='assigned'?'已分配':'未分配'});continue}if(seen.has(key)){duplicates.push({row:item.row,pid:item.pid,did:item.did,duplicateWith:'file',duplicateLabel:'导入文件内'});continue}seen.add(key);valid.push(item)}return{valid,duplicates}}
  private currentBatch(){const now=new Date(),part=(value:number)=>String(value).padStart(2,'0');return`${now.getFullYear()}${part(now.getMonth()+1)}${part(now.getDate())}_${part(now.getHours())}${part(now.getMinutes())}`}
}
