import net from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeMac } from '../domain/normalize.js'
import { AuditService } from './audit-service.js'
import { DistributionService } from './distribution-service.js'

export interface TelnetWriteInput { host:string; port:number; username:string; password:string; pid:string; networkInterface:string; targetPath:string; template:string; clientIp?:string|null }
export interface TelnetSession { command(command:string):Promise<string>; close():void }
export interface TelnetConnector { connect(host:string,port:number,username:string,password:string):Promise<TelnetSession> }

/** Minimal interactive Telnet client. Commands are written as protocol data, never through a host shell. */
export class TcpTelnetConnector implements TelnetConnector {
  async connect(host:string,port:number,username:string,password:string):Promise<TelnetSession> {
    const socket=net.createConnection({host,port});socket.setTimeout(12_000)
    let buffer='';let tail=Promise.resolve();let closed=false
    socket.on('data',(chunk:Buffer)=>{buffer+=chunk.toString('utf8').replace(/[\xff][\xfb-\xfe]./g,'')})
    await new Promise<void>((resolve,reject)=>{socket.once('connect',()=>resolve());socket.once('error',reject);socket.once('timeout',()=>reject(new Error('Telnet 连接超时')))})
    const waitFor=async(pattern:RegExp,label:string)=>{const started=Date.now();while(Date.now()-started<10_000){if(pattern.test(buffer))return buffer;await new Promise(resolve=>setTimeout(resolve,40))}throw new Error(`等待 Telnet ${label} 超时：${buffer.slice(-300)}`)}
    const send=(value:string)=>new Promise<void>((resolve,reject)=>socket.write(`${value}\r\n`,error=>error?reject(error):resolve()))
    try {
      let prompt=await waitFor(/(?:login|username)\s*:\s*$/im,'用户名提示')
      if(/(?:login|username)\s*:\s*$/im.test(prompt)){await send(username);buffer=''}
      prompt=await waitFor(/(?:password)\s*:\s*$/im,'密码提示');await send(password);buffer=''
      await waitFor(/(?:[$#>]\s*$|incorrect|authentication failed|login incorrect)/im,'登录结果')
      if(/incorrect|authentication failed|login incorrect/i.test(buffer))throw new Error('Telnet 用户名或密码错误')
      socket.setTimeout(0)
    } catch(error){socket.destroy();throw error}
    return {command:(command:string)=>{const run=async()=>{if(closed)throw new Error('Telnet 会话已关闭');buffer='';await send(command);await waitFor(/(?:[$#>]\s*$)/m,'命令提示符');return buffer};const result=tail.then(run);tail=result.then(()=>undefined,()=>undefined);return result},close(){closed=true;socket.end()}}
  }
}

export class TelnetService {
  constructor(private distribution:DistributionService,private audit:AuditService,private connector:TelnetConnector=new TcpTelnetConnector()){}
  async check(hostInput:string,portInput:number,username:string,password:string){const host=this.host(hostInput),port=this.port(portInput);const session=await this.connector.connect(host,port,username,password);session.close();return{connected:true,host,port}}
  async reboot(hostInput:string,portInput:number,usernameInput:string,password:string){const host=this.host(hostInput),port=this.port(portInput),username=usernameInput.trim();if(!username)throw new Error('请输入 Telnet 用户名');const session=await this.connector.connect(host,port,username,password);try{await session.command('reboot')}finally{session.close()}return{host,port,rebooting:true as const}}
  async write(input:TelnetWriteInput){
    const host=this.host(input.host),port=this.port(input.port),username=input.username.trim(),networkInterface=input.networkInterface.trim(),targetPath=input.targetPath.trim(),template=input.template
    if(!username)throw new Error('请输入 Telnet 用户名')
    if(!/^[A-Za-z0-9_.:-]{1,64}$/.test(networkInterface))throw new Error('网卡名称格式不正确')
    if(!targetPath.startsWith('/')||targetPath.includes('\0')||/[\r\n]/.test(targetPath))throw new Error('写入路径必须是设备端完整绝对路径')
    for(const slot of['{{pid}}','{{did}}','{{license}}'])if(!template.includes(slot))throw new Error(`文本模板缺少槽位：${slot}`)
    let mac='',pid=input.pid.trim(),did:string|undefined,session:TelnetSession|undefined
    try{
      session=await this.connector.connect(host,port,username,input.password)
      const macOutput=await session.command(`cat /sys/class/net/${networkInterface}/address`);mac=normalizeMac(macOutput.match(/(?:[0-9a-f]{2}:){5}[0-9a-f]{2}/i)?.[0]??'')
      if(!mac)throw new Error(`无法从网卡 ${networkInterface} 获取有效 MAC 地址`)
      const allocation=this.distribution.distribute(mac,pid,input.clientIp??null),data=allocation.body.data
      if(allocation.status!==200||!('display_code'in data))throw new Error(allocation.body.message)
      pid=String(data.pid);mac=String(data.mac);did=String(data.display_code);const license=String(data.payload.license??'')
      if(!license)throw new Error('分配记录中缺少 license')
      const content=template.replaceAll('{{pid}}',pid).replaceAll('{{did}}',did).replaceAll('{{license}}',license)
      const directory=await mkdtemp(join(tmpdir(),'auth-telnet-'))
      try{
        const localPath=join(directory,'authorization.txt');await writeFile(localPath,content,'utf8')
        // Base64 keeps template bytes intact and quotes prevent shell metacharacters in the path from executing.
        const encoded=Buffer.from(content,'utf8').toString('base64')
        await session.command(`printf '%s' '${encoded}' | base64 -d > '${targetPath.replaceAll("'","'\\''")}'`)
        const output=(await session.command('sync')).trim()
        this.audit.record({action:'telnet_write_succeeded',pid,mac,did,clientIp:input.clientIp,message:'Telnet 授权文件写入并同步成功',snapshot:{host,port,username,networkInterface,targetPath}})
        return{host,port,networkInterface,targetPath,pid,mac,did,license,mode:data.mode,content,output}
      }finally{await rm(directory,{recursive:true,force:true})}
    }catch(error){const reason=this.message(error);this.audit.record({action:'telnet_write_failed',pid:pid||null,mac:mac||null,did:did??null,clientIp:input.clientIp,message:did?`Telnet 授权文件写入失败：${reason}；授权码已保持分配状态`:`Telnet 授权文件写入失败：${reason}`,snapshot:{host,port,username,networkInterface,targetPath}});throw new Error(did?`${reason}；授权码已分配并保持绑定，请处理 Telnet 写入问题后重试`:reason)}finally{session?.close()}
  }
  private host(value:string){const host=value.trim();if(!host||/[\s/\\\0]/.test(host))throw new Error('请输入有效的设备 IP 地址');return host}
  private port(value:number){if(!Number.isInteger(value)||value<1||value>65535)throw new Error('Telnet 端口必须是 1-65535 的整数');return value}
  private message(error:unknown){return error instanceof Error?error.message:String(error)}
}
