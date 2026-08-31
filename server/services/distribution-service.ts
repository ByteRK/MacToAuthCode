import { AuthCodeRepository } from '../repositories/auth-code-repository.js'
import { AuditService } from './audit-service.js'
import { normalizeMac, normalizePid } from '../domain/normalize.js'
import { ProductionCounterService } from './production-counter-service.js'

export class DistributionService {
  constructor(private repository: AuthCodeRepository, private audit: AuditService,private counters?:ProductionCounterService) {}
  distribute(macInput:string,pidInput:string,clientIp:string|null) {
    const mac=normalizeMac(macInput); const pid=normalizePid(pidInput)
    return this.repository.database.transaction(() => {
      const existing=this.repository.findAssigned(pid,mac)
      if(existing){ this.audit.record({action:'reused',entityId:existing.id,pid,mac,did:existing.did,clientIp,message:'设备重复请求，返回已分配授权码'}); return this.response(existing,'reused','授权码已存在，返回原结果') }
      const assigned=this.repository.claimNext(pid,mac)
      if(!assigned){ this.audit.record({action:'exhausted',pid,mac,clientIp,message:'授权码库存不足'}); return { status:409, body:{success:false,message:'当前没有可分配的授权码',data:{pid,mac}} } }
      this.counters?.increment(pid)
      this.audit.record({action:'assigned',entityId:assigned.id,pid,mac,did:assigned.did,clientIp,message:'授权码分配成功'})
      return this.response(assigned,'assigned','授权码分配成功')
    })
  }
  private response(record: ReturnType<AuthCodeRepository['get']> extends infer T ? Exclude<T,null> : never, mode:string,message:string) {
    return { status:200, body:{success:true,message,data:{pid:record.pid,mac:record.assignedMac,display_code:record.did,payload:record.payload,assigned_at:record.assignedAt,source_batch:record.sourceBatch,mode}} }
  }
}
