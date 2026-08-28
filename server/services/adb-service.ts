import{execFile}from'node:child_process'
import{mkdtemp,rm,writeFile}from'node:fs/promises'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{promisify}from'node:util'
import{AuditService}from'./audit-service.js'
import{DistributionService}from'./distribution-service.js'

const execute=promisify(execFile)
export interface AdbDevice{serial:string;state:string;model:string;product:string;transportId:string;ready:boolean}
export interface AdbCommandRunner{run(args:string[]):Promise<{stdout:string;stderr:string}>}
export interface AdbWriteInput{serial:string;pid:string;networkInterface:string;targetPath:string;template:string;clientIp?:string|null}

class SystemAdbRunner implements AdbCommandRunner{
  async run(args:string[]){const result=await execute('adb',args,{timeout:15_000,maxBuffer:4*1024*1024,windowsHide:true,encoding:'utf8'});return{stdout:result.stdout,stderr:result.stderr}}
}

/** Keeps all host-side ADB execution behind one boundary so serial/USB adapters can evolve independently. */
export class AdbService{
  constructor(private distribution:DistributionService,private audit:AuditService,private runner:AdbCommandRunner=new SystemAdbRunner()){}

  async devices(){
    try{const result=await this.runner.run(['devices','-l']);return{installed:true,devices:this.parseDevices(result.stdout),error:''}}
    catch(error){if(this.missing(error))return{installed:false,devices:[]as AdbDevice[],error:'未检测到 adb 命令'};return{installed:true,devices:[]as AdbDevice[],error:this.message(error)}}
  }

  async write(input:AdbWriteInput){
    const serial=input.serial.trim(),networkInterface=input.networkInterface.trim(),targetPath=input.targetPath.trim(),template=input.template
    if(!serial)throw new Error('请选择 ADB 设备')
    if(!/^[A-Za-z0-9_.:-]{1,64}$/.test(networkInterface))throw new Error('网卡名称格式不正确')
    if(!targetPath.startsWith('/')||targetPath.includes('\0'))throw new Error('推送路径必须是设备端完整绝对路径')
    for(const slot of['{{pid}}','{{did}}','{{license}}'])if(!template.includes(slot))throw new Error(`文本模板缺少槽位：${slot}`)
    let mac='',pid=input.pid.trim(),did:string|undefined
    try{
      const macResult=await this.runner.run(['-s',serial,'shell','cat',`/sys/class/net/${networkInterface}/address`]);mac=macResult.stdout.trim()
      if(!mac)throw new Error(`无法从网卡 ${networkInterface} 获取 MAC 地址`)
      const allocation=this.distribution.distribute(mac,pid,input.clientIp??null),allocationData=allocation.body.data
      if(allocation.status!==200||!('display_code'in allocationData))throw new Error(allocation.body.message)
      const data=allocationData;pid=String(data.pid);mac=String(data.mac);did=String(data.display_code);const license=String(data.payload.license??'')
      if(!license)throw new Error('分配记录中缺少 license')
      const content=template.replaceAll('{{pid}}',pid).replaceAll('{{did}}',did).replaceAll('{{license}}',license)
      const directory=await mkdtemp(join(tmpdir(),'auth-adb-'))
      try{const localPath=join(directory,'authorization.txt');await writeFile(localPath,content,'utf8');const pushed=await this.runner.run(['-s',serial,'push',localPath,targetPath]);await this.runner.run(['-s',serial,'shell','sync']);const output=(pushed.stdout||pushed.stderr).trim();this.audit.record({action:'adb_write_succeeded',pid,mac,did,clientIp:input.clientIp,message:'ADB 授权文件写入并同步成功',snapshot:{serial,networkInterface,targetPath,output}});return{serial,networkInterface,targetPath,pid,mac,did,license,mode:data.mode,content,output}}
      finally{await rm(directory,{recursive:true,force:true})}
    }catch(error){const reason=this.message(error),message=did?`ADB 授权文件写入失败：${reason}；授权码已保持分配状态`:`ADB 授权文件写入失败：${reason}`;this.audit.record({action:'adb_write_failed',pid:pid||null,mac:mac||null,did:did??null,clientIp:input.clientIp,message,snapshot:{serial,networkInterface,targetPath}});throw new Error(did?`${reason}；授权码已分配并保持绑定，请处理 ADB 写入问题后重试`:reason)}
  }

  async reboot(serialInput:string){const serial=serialInput.trim();if(!serial)throw new Error('请选择 ADB 设备');await this.runner.run(['-s',serial,'reboot']);return{serial,rebooting:true as const}}

  private parseDevices(output:string):AdbDevice[]{return output.split(/\r?\n/).slice(1).map(line=>line.trim()).filter(Boolean).map(line=>{const[serial,state,...details]=line.split(/\s+/),fields=Object.fromEntries(details.map(item=>{const index=item.indexOf(':');return index<0?[item,'']:[item.slice(0,index),item.slice(index+1)]}));return{serial,state,model:fields.model??'',product:fields.product??'',transportId:fields.transport_id??'',ready:state==='device'}})}
  private missing(error:unknown){return typeof error==='object'&&error!==null&&'code'in error&&(error as{code?:string}).code==='ENOENT'}
  private message(error:unknown){return error instanceof Error?error.message:String(error)}
}
