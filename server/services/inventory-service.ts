import { Database } from '../db/database.js'
import { normalizePid } from '../domain/normalize.js'
import { AuthCodeRepository } from '../repositories/auth-code-repository.js'
import { AuditService } from './audit-service.js'

export interface CodeInput { pid:string; did:string; license:string; sourceBatch?:string|null; payload?:Record<string,string> }
export class InventoryService {
  constructor(private repo:AuthCodeRepository,private audit:AuditService,private operationPassword:string){}
  private confirmPassword(password:string){if(password!==this.operationPassword)throw new Error('授权码操作密码不正确')}
  private normalize(input:CodeInput){const pid=normalizePid(input.pid);const did=input.did.trim();const license=input.license.trim();if(!did)throw new Error('DID 不能为空');if(!license)throw new Error('license 不能为空');return {...input,pid,did,license,payload:input.payload??{}}}
  create(input:CodeInput){return this.repo.database.transaction(()=>{const record=this.repo.create(this.normalize(input));this.audit.record({action:'created',entityId:record.id,pid:record.pid,did:record.did,message:'新增授权码',snapshot:record});return record})}
  update(id:number,input:CodeInput,password:string){this.confirmPassword(password);return this.repo.database.transaction(()=>{const before=this.repo.get(id);if(!before)throw new Error('授权记录不存在');if(before.status==='assigned')throw new Error('已分配的授权码不允许编辑，请先解除绑定');const normalized=this.normalize(input);if(this.repo.findPidDidConflict(normalized.pid,normalized.did,id))throw new Error(`PID ${normalized.pid} 下已存在 DID ${normalized.did}，无法保存`);const record=this.repo.update(id,normalized);this.audit.record({action:'updated',entityId:id,pid:record?.pid,did:record?.did,message:'编辑授权码',snapshot:{before,after:record}});return record})}
  unbind(id:number,password:string){this.confirmPassword(password);return this.repo.database.transaction(()=>{const before=this.repo.get(id);if(!before)throw new Error('授权记录不存在');const record=this.repo.unbind(id);this.audit.record({action:'unbound',entityId:id,pid:before.pid,mac:before.assignedMac,did:before.did,message:'解除设备绑定',snapshot:before});return record})}
  delete(ids:number[],password:string){this.confirmPassword(password);return this.repo.database.transaction(()=>{let deleted=0;for(const id of ids){const record=this.repo.get(id);if(!record)continue;this.repo.delete(id);deleted++;this.audit.record({action:'deleted',entityId:id,pid:record.pid,mac:record.assignedMac,did:record.did,message:'删除授权码',snapshot:record})}return {deleted}})}
}
