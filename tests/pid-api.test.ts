import {mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{afterEach,beforeEach,describe,expect,it}from'vitest'
import{buildApp}from'../server/app.js'
import type{AppConfig}from'../server/config.js'

describe('PID management',()=>{
  let dir:string,app:Awaited<ReturnType<typeof buildApp>>,cookie:string
  beforeEach(async()=>{dir=mkdtempSync(join(tmpdir(),'auth-pid-test-'));const config:AppConfig={appName:'test',host:'127.0.0.1',port:8080,adminUser:'admin',adminPassword:'secret',dataDir:dir,databasePath:join(dir,'db.sqlite'),publicDir:join(dir,'public')};app=await buildApp(config);const login=await app.inject({method:'POST',url:'/api/admin/login',payload:{username:'admin',password:'secret'}});cookie=login.headers['set-cookie']!;for(const did of ['D1','D2'])await app.inject({method:'POST',url:'/api/admin/codes',headers:{cookie},payload:{pid:'P1001',did,license:`L-${did}`,payload:{}}})})
  afterEach(async()=>{await app.close();rmSync(dir,{recursive:true,force:true})})
  it('aggregates PID data and exposes remarks in codes and logs',async()=>{const initial=(await app.inject({method:'GET',url:'/api/admin/pids',headers:{cookie}})).json().data;expect(initial.items[0]).toMatchObject({pid:'P1001',remark:'',totalCodes:2,availableCodes:2,assignedCodes:0});const saved=await app.inject({method:'PUT',url:'/api/admin/pids/P1001/remark',headers:{cookie},payload:{remark:'智能网关产品'}});expect(saved.statusCode).toBe(200);const searched=(await app.inject({method:'GET',url:'/api/admin/pids?search=智能网关',headers:{cookie}})).json().data;expect(searched.items[0]).toMatchObject({pid:'P1001',remark:'智能网关产品'});const codes=(await app.inject({method:'GET',url:'/api/admin/codes?pid=P1001',headers:{cookie}})).json().data;expect(codes.items[0].pidRemark).toBe('智能网关产品');const logs=(await app.inject({method:'GET',url:'/api/admin/logs',headers:{cookie}})).json().data;expect(logs.items.some((item:{pid:string;pidRemark:string})=>item.pid==='P1001'&&item.pidRemark==='智能网关产品')).toBe(true)})
  it('sorts PID values without case sensitivity',async()=>{for(const pid of['zPid','aPid'])await app.inject({method:'POST',url:'/api/admin/codes',headers:{cookie},payload:{pid,did:`D-${pid}`,license:'L',payload:{}}});const result=(await app.inject({method:'GET',url:'/api/admin/pids',headers:{cookie}})).json().data;expect(result.items.map((item:{pid:string})=>item.pid)).toEqual(['aPid','P1001','zPid'])})
})
