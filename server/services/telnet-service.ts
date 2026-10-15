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

/**
 * A line-ending `#`/`$`/`>` marks an interactive shell prompt; `>` must not be part of an
 * arrow such as `->` or `=>`, which often appears in banners. Login/password prompts and
 * auth failures are matched separately because some embedded servers localize or omit them.
 */
const shellPrompt=/(?:^|\n)[^\r\n]{0,120}(?:[#$]|(?<![=\-])>)\s*$/m
const loginPrompt=/(?:login|username)\s*:\s*$/im
const passwordPrompt=/password\s*:\s*$/im
const authFailure=/incorrect|authentication failed|login incorrect/i

/**
 * Decode raw Telnet bytes into printable text. Telnet control bytes are consumed
 * incrementally so a sequence split across TCP chunks is still handled correctly:
 * IAC negotiation (WILL/WONT/DO/DONT), IAC SB ... IAC SE sub-negotiation, and escaped
 * IAC IAC. ANSI/escape sequences and stray control bytes are dropped; a trailing
 * incomplete sequence is left in place for the next chunk.
 */
function decodeTelnetStream(pending:Buffer):{text:string;consumed:number}{
  const bytes:number[]=[]
  let i=0
  while(i<pending.length){
    const b=pending[i]
    if(b===0xff){                                                  // IAC
      if(i+1>=pending.length)break
      const n=pending[i+1]
      if(n===0xff){bytes.push(0xff);i+=2;continue}                 // escaped IAC -> literal 0xff
      if(n===0xfa){                                                // SB ... IAC SE sub-negotiation
        let end=-1
        for(let j=i+2;j+1<pending.length;j++){if(pending[j]===0xff&&pending[j+1]===0xf0){end=j+2;break}}
        if(end<0)break
        i=end;continue
      }
      i+=2;continue                                                // two-byte negotiation command
    }
    if(b===0x1b){                                                  // ANSI / escape sequence
      if(i+1>=pending.length)break
      if(pending[i+1]===0x5b){                                     // CSI: ESC [ ... final(0x40-0x7e)
        let j=i+2
        while(j<pending.length&&!(pending[j]>=0x40&&pending[j]<=0x7e))j++
        if(j>=pending.length)break
        i=j+1;continue
      }
      i+=2;continue                                                // two-byte escape sequence
    }
    if(b===0x09||b===0x0a||b===0x0d||(b>=0x20&&b!==0x7f))bytes.push(b)
    i++
  }
  return{text:Buffer.from(bytes).toString('latin1'),consumed:i}
}

/** Minimal interactive Telnet client. Commands are written as protocol data, never through a host shell. */
export class TcpTelnetConnector implements TelnetConnector {
  async connect(host:string,port:number,username:string,password:string):Promise<TelnetSession> {
    const socket=net.createConnection({host,port});socket.setTimeout(12_000)
    let buffer='';let tail=Promise.resolve();let closed=false
    let pending=Buffer.alloc(0)
    socket.on('data',(chunk:Buffer)=>{pending=Buffer.concat([pending,chunk]);const decoded=decodeTelnetStream(pending);if(decoded.text)buffer+=decoded.text;if(decoded.consumed)pending=pending.subarray(decoded.consumed)})
    await new Promise<void>((resolve,reject)=>{socket.once('connect',()=>resolve());socket.once('error',reject);socket.once('timeout',()=>reject(new Error('Telnet 连接超时')))})
    const waitFor=async(pattern:RegExp,label:string,timeout=10_000)=>{const started=Date.now();while(Date.now()-started<timeout){if(pattern.test(buffer))return buffer;await new Promise(resolve=>setTimeout(resolve,40))}throw new Error(`等待 Telnet ${label} 超时：${buffer.slice(-300)}`)}
    const send=(value:string)=>new Promise<void>((resolve,reject)=>socket.write(`${value}\r\n`,error=>error?reject(error):resolve()))
    try {
      // Empty credentials are common on embedded devices: such servers skip login and drop
      // straight into a shell, so the first thing to appear may be any of these prompts.
      const first=await waitFor(new RegExp(`${shellPrompt.source}|${loginPrompt.source}|${passwordPrompt.source}|${authFailure.source}`,'im'),'登录提示')
      if(authFailure.test(first))throw new Error('Telnet 用户名或密码错误')
      if(loginPrompt.test(first)){
        await send(username);buffer=''
        const next=await waitFor(new RegExp(`${shellPrompt.source}|${passwordPrompt.source}|${authFailure.source}`,'im'),'密码提示或 Shell 提示')
        if(authFailure.test(next))throw new Error('Telnet 用户名或密码错误')
        if(passwordPrompt.test(next)){await send(password);buffer='';const loggedIn=await waitFor(new RegExp(`${shellPrompt.source}|${authFailure.source}`,'im'),'登录结果');if(authFailure.test(loggedIn))throw new Error('Telnet 用户名或密码错误')}
      }else if(passwordPrompt.test(first)){
        await send(password);buffer='';const loggedIn=await waitFor(new RegExp(`${shellPrompt.source}|${authFailure.source}`,'im'),'登录结果');if(authFailure.test(loggedIn))throw new Error('Telnet 用户名或密码错误')
      }
      socket.setTimeout(0)
    } catch(error){socket.destroy();throw error}
    return {command:(command:string)=>{const run=async()=>{if(closed)throw new Error('Telnet 会话已关闭');buffer='';await send(command);await waitFor(shellPrompt,'命令提示符',30_000);return buffer};const result=tail.then(run);tail=result.then(()=>undefined,()=>undefined);return result},close(){closed=true;socket.end()}}
  }
}

export class TelnetService {
  constructor(private distribution:DistributionService,private audit:AuditService,private connector:TelnetConnector=new TcpTelnetConnector()){}
  async check(hostInput:string,portInput:number,username:string,password:string){const host=this.host(hostInput),port=this.port(portInput);const session=await this.connector.connect(host,port,username,password);session.close();return{connected:true,host,port}}
  async reboot(hostInput:string,portInput:number,usernameInput:string,password:string){const host=this.host(hostInput),port=this.port(portInput),username=usernameInput.trim();const session=await this.connector.connect(host,port,username,password);try{await session.command('reboot')}finally{session.close()}return{host,port,rebooting:true as const}}
  async write(input:TelnetWriteInput){
    const host=this.host(input.host),port=this.port(input.port),username=input.username.trim(),networkInterface=input.networkInterface.trim(),targetPath=input.targetPath.trim(),template=input.template
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
