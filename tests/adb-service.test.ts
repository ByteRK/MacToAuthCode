import{mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{afterEach,beforeEach,describe,expect,it}from'vitest'
import{Database}from'../server/db/database.js'
import{AuthCodeRepository}from'../server/repositories/auth-code-repository.js'
import{AdbService,type AdbCommandRunner}from'../server/services/adb-service.js'
import{AuditService}from'../server/services/audit-service.js'
import{DistributionService}from'../server/services/distribution-service.js'

class FakeRunner implements AdbCommandRunner{
  calls:string[][]=[]
  constructor(private handler:(args:string[])=>Promise<{stdout:string;stderr:string}>|{stdout:string;stderr:string}){}
  async run(args:string[]){this.calls.push(args);return this.handler(args)}
}

describe('ADB authorization writer',()=>{
  let dir:string,database:Database,repo:AuthCodeRepository,audit:AuditService
  beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'auth-adb-test-'));database=new Database(join(dir,'db.sqlite'));repo=new AuthCodeRepository(database);audit=new AuditService(database)})
  afterEach(()=>{database.close();rmSync(dir,{recursive:true,force:true})})

  it('lists multiple devices and preserves non-ready states',async()=>{const runner=new FakeRunner(()=>({stdout:'List of devices attached\nSERIAL-1 device product:p model:Model_A transport_id:1\nSERIAL-2 unauthorized usb:1-1\n',stderr:''})),service=new AdbService(new DistributionService(repo,audit),audit,runner);expect(await service.devices()).toMatchObject({installed:true,devices:[{serial:'SERIAL-1',ready:true,model:'Model_A'},{serial:'SERIAL-2',ready:false,state:'unauthorized'}]})})

  it('reads MAC, allocates normally, replaces slots and pushes the generated text',async()=>{repo.create({pid:'P1',did:'D1',license:'L1',payload:{}});const runner=new FakeRunner(args=>args.includes('cat')?{stdout:'aa:bb:cc:11:22:33\n',stderr:''}:{stdout:'1 file pushed',stderr:''}),service=new AdbService(new DistributionService(repo,audit),audit,runner);const result=await service.write({serial:'SERIAL-1',pid:'P1',networkInterface:'wlan0',targetPath:'/sdcard/license.txt',template:'{{pid}}|{{did}}|{{license}}'});expect(result).toMatchObject({pid:'P1',mac:'AA:BB:CC:11:22:33',did:'D1',license:'L1',content:'P1|D1|L1'});expect(runner.calls.at(-1)).toMatchObject(['-s','SERIAL-1','push',expect.any(String),'/sdcard/license.txt']);expect(audit.list(10,'adb_write_succeeded')).toHaveLength(1)})

  it('keeps the allocation and records failure when adb push fails',async()=>{repo.create({pid:'P1',did:'D1',license:'L1',payload:{}});const runner=new FakeRunner(args=>{if(args.includes('cat'))return{stdout:'AA:BB:CC:11:22:33',stderr:''};throw new Error('remote permission denied')}),service=new AdbService(new DistributionService(repo,audit),audit,runner);await expect(service.write({serial:'SERIAL-1',pid:'P1',networkInterface:'wlan0',targetPath:'/system/license.txt',template:'{{pid}} {{did}} {{license}}'})).rejects.toThrow('保持绑定');expect(repo.findByPidDid('P1','D1')).toMatchObject({status:'assigned',assignedMac:'AA:BB:CC:11:22:33'});expect(audit.list(10,'adb_write_failed')[0]).toMatchObject({did:'D1',message:expect.stringContaining('保持分配状态')})})

  it('reports a missing adb executable without throwing',async()=>{const runner=new FakeRunner(async()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'})}),service=new AdbService(new DistributionService(repo,audit),audit,runner);expect(await service.devices()).toEqual({installed:false,devices:[],error:'未检测到 adb 命令'})})
})
