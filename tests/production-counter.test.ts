import{mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{afterEach,describe,expect,it}from'vitest'
import{Database}from'../server/db/database.js'
import{AuthCodeRepository}from'../server/repositories/auth-code-repository.js'
import{AuditService}from'../server/services/audit-service.js'
import{DistributionService}from'../server/services/distribution-service.js'
import{ProductionCounterService}from'../server/services/production-counter-service.js'

describe('production counters',()=>{const dirs:string[]=[];afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100})});it('counts only first allocations, persists across restarts and supports cancellation',()=>{
  const dir=mkdtempSync(join(tmpdir(),'production-counter-test-'));dirs.push(dir);const path=join(dir,'db.sqlite')
  let database:Database|undefined
  try{
    database=new Database(path);let repo=new AuthCodeRepository(database),audit=new AuditService(database),counters=new ProductionCounterService(database,audit),distribution=new DistributionService(repo,audit,counters)
    repo.create({pid:'P1',did:'D1',license:'L1',payload:{}});repo.create({pid:'P1',did:'D2',license:'L2',payload:{}});repo.create({pid:'P2',did:'D3',license:'L3',payload:{}})
    counters.start('P1',1,'白班');counters.start('P2',10,'夜班');distribution.distribute('00:00:00:00:00:01','P1',null);distribution.distribute('00:00:00:00:00:01','P1',null);distribution.distribute('00:00:00:00:00:02','P2',null)
    expect(counters.list().map(({pid,count,active})=>({pid,count,active}))).toEqual([{pid:'P1',count:1,active:true},{pid:'P2',count:1,active:true}])
    database.close();database=undefined
    database=new Database(path);audit=new AuditService(database);counters=new ProductionCounterService(database,audit)
    expect(counters.list().find(item=>item.pid==='P1')).toMatchObject({count:1,targetCount:1,note:'白班',active:true})
    counters.cancel('P1');expect(counters.list().some(item=>item.pid==='P1')).toBe(false);expect(audit.list(1,'production_counter_cancelled')[0].message).toContain('实时数量：1；目标数量：1；备注：白班')
  }finally{database?.close()}
})})
