import{mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{afterEach,beforeEach,describe,expect,it}from'vitest'
import{Database}from'../server/db/database.js'
import{AuthCodeRepository}from'../server/repositories/auth-code-repository.js'
import{AuditService}from'../server/services/audit-service.js'
import{DistributionService}from'../server/services/distribution-service.js'
import{TelnetService,type TelnetConnector,type TelnetSession}from'../server/services/telnet-service.js'

class FakeConnector implements TelnetConnector{
  calls:string[]=[];credentials:{host:string;port:number;username:string;password:string}|undefined
  constructor(private failAt=''){}
  async connect(host:string,port:number,username:string,password:string):Promise<TelnetSession>{this.credentials={host,port,username,password};return{command:async(command:string)=>{this.calls.push(command);if(this.failAt&&command.startsWith(this.failAt))throw new Error('remote permission denied');if(command.startsWith('cat '))return'aa:bb:cc:11:22:33\n';return''},close(){}}}
}

describe('Telnet authorization writer',()=>{
  let dir:string,database:Database,repo:AuthCodeRepository,audit:AuditService
  beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'auth-telnet-test-'));database=new Database(join(dir,'db.sqlite'));repo=new AuthCodeRepository(database);audit=new AuditService(database)})
  afterEach(()=>{database.close();rmSync(dir,{recursive:true,force:true})})
  it('reads MAC, allocates normally and writes rendered content to the remote path',async()=>{repo.create({pid:'P1',did:'D1',license:'L1',payload:{}});const connector=new FakeConnector(),service=new TelnetService(new DistributionService(repo,audit),audit,connector);const result=await service.write({host:'192.168.1.8',port:23,username:'root',password:'secret',pid:'P1',networkInterface:'eth0',targetPath:'/etc/license.txt',template:'{{pid}}|{{did}}|{{license}}'});expect(result).toMatchObject({pid:'P1',mac:'AA:BB:CC:11:22:33',did:'D1',content:'P1|D1|L1'});expect(connector.calls[0]).toBe('cat /sys/class/net/eth0/address');expect(connector.calls[1]).toContain("/etc/license.txt");expect(connector.calls[2]).toBe('sync');expect(connector.credentials?.password).toBe('secret');expect(audit.list(10,'telnet_write_succeeded')).toHaveLength(1)})
  it('keeps allocation assigned and records failure if remote write fails',async()=>{repo.create({pid:'P1',did:'D1',license:'L1',payload:{}});const connector=new FakeConnector("printf '%s'"),service=new TelnetService(new DistributionService(repo,audit),audit,connector);await expect(service.write({host:'192.168.1.8',port:23,username:'root',password:'secret',pid:'P1',networkInterface:'eth0',targetPath:'/etc/license.txt',template:'{{pid}} {{did}} {{license}}'})).rejects.toThrow('保持绑定');expect(repo.findByPidDid('P1','D1')).toMatchObject({status:'assigned',assignedMac:'AA:BB:CC:11:22:33'});expect(audit.list(10,'telnet_write_failed')[0]).toMatchObject({did:'D1',message:expect.stringContaining('保持分配状态')})})
  it('validates the remote host and port',async()=>{const service=new TelnetService(new DistributionService(repo,audit),audit,new FakeConnector());await expect(service.check('',23,'root','secret')).rejects.toThrow('IP');await expect(service.check('192.168.1.8',0,'root','secret')).rejects.toThrow('端口')})
  it('reboots through the authenticated Telnet session without writing audit logs',async()=>{const connector=new FakeConnector(),service=new TelnetService(new DistributionService(repo,audit),audit,connector);await expect(service.reboot('192.168.1.8',23,'root','')).resolves.toEqual({host:'192.168.1.8',port:23,rebooting:true});expect(connector.calls).toEqual(['reboot']);expect(audit.list(10)).toHaveLength(0)})
})
