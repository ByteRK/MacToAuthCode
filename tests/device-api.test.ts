import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {buildApp} from '../server/app.js'
import {Database} from '../server/db/database.js'
import {AuthCodeRepository} from '../server/repositories/auth-code-repository.js'
import type{AppConfig}from '../server/config.js'

describe('POST /api/device/authorize compatibility',()=>{
  let dir:string,db:Database,app:Awaited<ReturnType<typeof buildApp>>,repo:AuthCodeRepository
  beforeEach(async()=>{dir=mkdtempSync(join(tmpdir(),'auth-platform-test-'));const config:AppConfig={appName:'test',host:'127.0.0.1',port:8080,adminUser:'admin',adminPassword:'secret',dataDir:dir,databasePath:join(dir,'test.db'),publicDir:join(dir,'public')};db=new Database(config.databasePath);repo=new AuthCodeRepository(db);app=await buildApp(config,db)})
  afterEach(async()=>{await app.close();rmSync(dir,{recursive:true,force:true})})
  it('assigns FIFO and returns the same record for repeated PID + MAC',async()=>{repo.create({pid:'P1001',did:'DID-1',license:'LIC-1',payload:{extra:'value'},sourceBatch:'B1'});repo.create({pid:'P1001',did:'DID-2',license:'LIC-2',payload:{}});const first=await app.inject({method:'POST',url:'/api/device/authorize',payload:{mac:'aa-bb-cc-11-22-33',pid:'P1001'}});expect(first.statusCode).toBe(200);expect(first.json().data).toMatchObject({pid:'P1001',mac:'AA:BB:CC:11:22:33',display_code:'DID-1',mode:'assigned',source_batch:'B1',payload:{did:'DID-1',license:'LIC-1',extra:'value'}});const repeated=await app.inject({method:'POST',url:'/api/device/authorize',payload:{mac:'AA:BB:CC:11:22:33',pid:'P1001'}});expect(repeated.statusCode).toBe(200);expect(repeated.json().data).toMatchObject({display_code:'DID-1',mode:'reused'})})
  it('isolates inventory by PID and reports exhaustion',async()=>{repo.create({pid:'OTHER',did:'DID-1',license:'LIC-1',payload:{}});const response=await app.inject({method:'POST',url:'/api/device/authorize',payload:{mac:'AA:BB:CC:11:22:33',pid:'P1001'}});expect(response.statusCode).toBe(409);expect(response.json()).toEqual({success:false,message:'当前没有可分配的授权码',data:{pid:'P1001',mac:'AA:BB:CC:11:22:33'}})})
  it('lists successful allocations by newest assignment first',async()=>{repo.create({pid:'P1',did:'D1',license:'L1',payload:{}});repo.create({pid:'P1',did:'D2',license:'L2',payload:{}});await app.inject({method:'POST',url:'/api/device/authorize',payload:{mac:'00:00:00:00:00:01',pid:'P1'}});await app.inject({method:'POST',url:'/api/device/authorize',payload:{mac:'00:00:00:00:00:02',pid:'P1'}});expect(repo.listAllocations({page:1,pageSize:20}).items.map(item=>item.did)).toEqual(['D2','D1'])})
  it('accepts form bodies and preserves validation messages',async()=>{const missing=await app.inject({method:'POST',url:'/api/device/authorize',headers:{'content-type':'application/x-www-form-urlencoded'},payload:'pid=P1001'});expect(missing.statusCode).toBe(400);expect(missing.json().message).toBe('请求体缺少 mac 字段');const invalid=await app.inject({method:'POST',url:'/api/device/authorize',payload:{mac:'bad',pid:'P1001'}});expect(invalid.statusCode).toBe(400);expect(invalid.json().message).toBe('MAC 地址格式不正确')})
  it('responds to CORS preflight',async()=>{const response=await app.inject({method:'OPTIONS',url:'/api/device/authorize'});expect(response.statusCode).toBe(204);expect(response.headers['access-control-allow-origin']).toBe('*')})
})
