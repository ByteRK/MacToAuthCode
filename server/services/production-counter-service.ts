import { Database } from '../db/database.js'
import { normalizePid } from '../domain/normalize.js'
import { AuditService } from './audit-service.js'

type CounterRow={pid:string;remark:string;count:number;target_count:number;note:string;active:number;started_at:string|null;stopped_at:string|null;updated_at:string}
const decode=(row:CounterRow)=>({pid:row.pid,remark:row.remark,count:Number(row.count),targetCount:Number(row.target_count),note:row.note,active:Boolean(row.active),startedAt:row.started_at,stoppedAt:row.stopped_at,updatedAt:row.updated_at})

export class ProductionCounterService {
  constructor(private database:Database,private audit:AuditService){}

  list(){
    const rows=this.database.raw.prepare(`SELECT c.*,COALESCE(m.remark,'') remark FROM production_counters c
      LEFT JOIN pid_metadata m ON m.pid=c.pid ORDER BY c.active DESC,c.pid COLLATE NOCASE ASC,c.pid ASC`).all() as unknown as CounterRow[]
    return rows.map(decode)
  }
  activeSummary(){return this.list().filter(item=>item.active)}
  start(pidInput:string,targetInput:number,noteInput:string){
    const pid=normalizePid(pidInput),targetCount=Number(targetInput),note=noteInput.trim()
    if(!Number.isInteger(targetCount)||targetCount<=0)throw new Error('目标数量必须是大于 0 的整数')
    if(targetCount>10_000_000)throw new Error('目标数量不能超过 10000000')
    if(!note)throw new Error('请填写生产备注')
    if(note.length>200)throw new Error('生产备注长度不能超过 200 个字符')
    const exists=this.database.raw.prepare('SELECT 1 FROM auth_codes WHERE pid=? LIMIT 1').get(pid)
    if(!exists)throw new Error('当前系统不存在该 PID 的授权码数据')
    if(this.database.raw.prepare('SELECT 1 FROM production_counters WHERE pid=?').get(pid))throw new Error('该 PID 已存在生产计数，请先取消原计数任务')
    this.database.raw.prepare(`INSERT INTO production_counters(pid,count,target_count,note,active,started_at,stopped_at,updated_at)
      VALUES(?,0,?,?,1,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP)`).run(pid,targetCount,note)
    const counter=this.get(pid);this.record('production_counter_started','启动生产计数',counter)
    return counter
  }
  cancel(pidInput:string){
    const pid=normalizePid(pidInput),before=this.get(pid),changed=this.database.raw.prepare('DELETE FROM production_counters WHERE pid=?').run(pid)
    if(changed.changes!==1)throw new Error('生产计数不存在')
    this.record('production_counter_cancelled','取消生产计数',before)
    return {pid}
  }
  /** Called inside the same write transaction as a first-time authorization claim. */
  increment(pid:string){this.database.raw.prepare('UPDATE production_counters SET count=count+1,updated_at=CURRENT_TIMESTAMP WHERE pid=? AND active=1').run(pid)}
  private get(pid:string){
    const row=this.database.raw.prepare(`SELECT c.*,COALESCE(m.remark,'') remark FROM production_counters c LEFT JOIN pid_metadata m ON m.pid=c.pid WHERE c.pid=?`).get(pid) as unknown as CounterRow|undefined
    if(!row)throw new Error('生产计数不存在')
    return decode(row)
  }
  private record(action:string,label:string,counter:ReturnType<typeof decode>){
    const note=counter.note||'无'
    this.audit.record({action,entityType:'production_counter',pid:counter.pid,message:`${label}；实时：${counter.count}；目标：${counter.targetCount}；备注：${note}`,snapshot:{count:counter.count,targetCount:counter.targetCount,note:counter.note}})
  }
}
