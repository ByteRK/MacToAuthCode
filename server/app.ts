import { existsSync } from 'node:fs'
import { join } from 'node:path'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import formbody from '@fastify/formbody'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import type { AppConfig } from './config.js'
import { Database } from './db/database.js'
import { AuthCodeRepository } from './repositories/auth-code-repository.js'
import { AuditService } from './services/audit-service.js'
import { AuditArchiveService } from './services/audit-archive-service.js'
import { AuthService } from './services/auth-service.js'
import { DistributionService } from './services/distribution-service.js'
import { InventoryService } from './services/inventory-service.js'
import { ExcelService } from './services/excel-service.js'
import { MigrationService } from './services/migration-service.js'
import { PidService } from './services/pid-service.js'
import { CiotImportService } from './services/ciot-import-service.js'
import { AdbService } from './services/adb-service.js'

const numberParam=(value:unknown,fallback:number,min=1,max=100)=>Math.min(Math.max(Number(value)||fallback,min),max)

export async function buildApp(config:AppConfig,database=new Database(config.databasePath)) {
  const app=Fastify({logger:config.debug===true,bodyLimit:50*1024*1024});await app.register(cookie);await app.register(formbody);await app.register(multipart,{limits:{fileSize:50*1024*1024}})
  // The legacy endpoint accepted uncommon content types and then fell back to query parameters.
  app.addContentTypeParser('*',{parseAs:'string'},(_request,body,done)=>done(null,body))
  const repo=new AuthCodeRepository(database);const audit=new AuditService(database);const auditArchives=new AuditArchiveService(database,config.dataDir);const auth=new AuthService(config);const distribution=new DistributionService(repo,audit);const inventory=new InventoryService(repo,audit,config.operationPassword);const excel=new ExcelService(repo,audit);const ciot=new CiotImportService(repo,audit);const migration=new MigrationService(repo,audit);const pids=new PidService(database,audit);const adb=new AdbService(distribution,audit);const deviceRequests=new WeakMap<FastifyRequest,Record<string,unknown>>()
  const runArchive=()=>{try{const result=auditArchives.archive();if(result.archived)console.log(`已自动归档 ${result.archived} 条审计日志。`)}catch(error){console.error('审计日志自动归档失败，主库数据未删除：',error)}}
  runArchive();const archiveTimer=setInterval(runArchive,24*60*60*1000);archiveTimer.unref()
  app.addHook('onClose',()=>{clearInterval(archiveTimer);database.close()})
  app.addHook('onSend',async(request,reply,payload)=>{if(request.url.startsWith('/api/device/')){reply.headers({'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type, Authorization','access-control-max-age':'86400'});if(request.method==='POST'&&request.url.startsWith('/api/device/authorize'))logDeviceExchange(request,reply,payload,deviceRequests.get(request))}return payload})
  app.options('/api/device/authorize',async(_,reply)=>reply.code(204).send())
  app.post('/api/device/authorize',async(request,reply)=>{const data=await devicePayload(request);deviceRequests.set(request,data);const mac=String(data.mac??'').trim();const pid=String(data.pid??'').trim();if(!mac)return reply.code(400).send({success:false,message:'请求体缺少 mac 字段'});if(!pid)return reply.code(400).send({success:false,message:'请求体缺少 pid 字段'});try{const result=distribution.distribute(mac,pid,request.ip);return reply.code(result.status).send(result.body)}catch(error){return reply.code(400).send({success:false,message:(error as Error).message})}})
  app.get('/healthz',async()=>({success:true,message:'ok'}))

  app.post('/api/admin/login',async(request,reply)=>{const body=request.body as Record<string,string>;if(!auth.verifyCredentials(body?.username??'',body?.password??''))return reply.code(401).send({success:false,message:'用户名或密码错误'});reply.setCookie('auth_session',auth.issue(),{httpOnly:true,sameSite:'strict',path:'/'});return {success:true,data:{username:body.username}}})
  app.post('/api/admin/logout',async(_,reply)=>{reply.clearCookie('auth_session',{path:'/'});return {success:true}})
  app.addHook('preHandler',async(request,reply)=>{if(request.url.startsWith('/api/admin/')&&!request.url.startsWith('/api/admin/login')&&!auth.verify(request.cookies.auth_session))return reply.code(401).send({success:false,message:'未登录或登录已失效'})})
  app.get('/api/admin/session',async()=>({success:true,data:{username:config.adminUser}}))
  app.get('/api/admin/overview',async()=>({success:true,data:{summary:repo.summary()}}))
  app.get('/api/admin/pids',async(request)=>{const q=request.query as Record<string,string>;return {success:true,data:pids.list({page:numberParam(q.page,1),pageSize:numberParam(q.pageSize,20),search:q.search??''})}})
  app.get('/api/admin/pids/options',async()=>({success:true,data:pids.options()}))
  app.post('/api/admin/pids/remarks/import',async(request,reply)=>{try{const{buffer}=await uploaded(request);return{success:true,data:pids.importRemarks(buffer)}}catch(error){return apiError(reply,error)}})
  app.get('/api/admin/pids/remarks/export',async(_,reply)=>reply.header('content-type','application/json; charset=utf-8').header('content-disposition','attachment; filename="pid-remarks.json"').send(pids.exportRemarks()))
  app.put('/api/admin/pids/:pid/remark',async(request,reply)=>{try{return {success:true,data:pids.updateRemark(decodeURIComponent((request.params as {pid:string}).pid),String((request.body as {remark?:string})?.remark??''))}}catch(error){return apiError(reply,error)}})
  app.get('/api/admin/codes',async(request)=>{const q=request.query as Record<string,string>;return {success:true,data:repo.list({page:numberParam(q.page,1),pageSize:numberParam(q.pageSize??q.page_size,20),search:q.search,status:q.status,pid:q.pid})}})
  app.get('/api/admin/allocations',async(request)=>{const q=request.query as Record<string,string>;return {success:true,data:repo.listAllocations({page:numberParam(q.page,1),pageSize:numberParam(q.pageSize,20),search:q.search})}})
  app.post('/api/admin/codes',async(request,reply)=>{try{return {success:true,data:inventory.create(request.body as never)}}catch(error){return apiError(reply,error)}})
  app.put('/api/admin/codes/:id',async(request,reply)=>{try{const body=request.body as Record<string,unknown>;return {success:true,data:inventory.update(Number((request.params as {id:string}).id),body as never,String(body.password??''))}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/codes/:id/unbind',async(request,reply)=>{try{const body=request.body as {password?:string};return {success:true,data:inventory.unbind(Number((request.params as {id:string}).id),body?.password??'')}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/codes/delete',async(request,reply)=>{try{const body=request.body as {ids:number[];password:string};return {success:true,data:inventory.delete(body.ids??[],body.password??'')}}catch(error){return apiError(reply,error)}})
  app.get('/api/admin/adb/devices',async()=>({success:true,data:await adb.devices()}))
  app.post('/api/admin/adb/write',async(request,reply)=>{try{const body=request.body as{serial?:string;pid?:string;networkInterface?:string;targetPath?:string;template?:string};return{success:true,data:await adb.write({serial:body.serial??'',pid:body.pid??'',networkInterface:body.networkInterface??'',targetPath:body.targetPath??'',template:body.template??'',clientIp:request.ip})}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/adb/reboot',async(request,reply)=>{try{return{success:true,data:await adb.reboot(String((request.body as{serial?:string})?.serial??''))}}catch(error){return apiError(reply,error)}})
  app.get('/api/admin/log-archives',async()=>({success:true,data:{items:auditArchives.archives()}}))
  app.get('/api/admin/logs',async(request,reply)=>{try{const q=request.query as Record<string,string>,limit=numberParam(q.limit,50,5,1000);return {success:true,data:{items:q.archive?auditArchives.list(q.archive,limit,q.action??'',q.search):audit.list(limit,q.action??'',q.search)}}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/import/preview',async(request,reply)=>{try{const {buffer,fields}=await uploaded(request);return {success:true,data:excel.preview(buffer,fields.sourceBatch??fields.source_batch??'',fields.defaultPid??fields.default_pid??'')}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/import',async(request,reply)=>{try{const {buffer,fields}=await uploaded(request);return {success:true,data:excel.import(buffer,fields.sourceBatch??fields.source_batch??'',fields.defaultPid??fields.default_pid??'')}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/ciot-import/preview',async(request,reply)=>{try{const{buffer,fields}=await uploaded(request);return{success:true,data:ciot.preview(buffer,fields.pid??'',fields.sourceBatch??fields.source_batch??'')}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/ciot-import',async(request,reply)=>{try{const{buffer,fields}=await uploaded(request);return{success:true,data:ciot.import(buffer,fields.pid??'',fields.sourceBatch??fields.source_batch??'')}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/ciot-import/convert-preview',async(request,reply)=>{try{const{buffer,fields}=await uploaded(request);return{success:true,data:ciot.conversionPreview(buffer,fields.pid??'')}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/ciot-import/convert',async(request,reply)=>{try{const{buffer,fields}=await uploaded(request);return sendWorkbook(reply,ciot.convert(buffer,fields.pid??''),'ciot-batch-import.xlsx')}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/migrate',async(request,reply)=>{try{const {buffer}=await uploaded(request);return {success:true,data:migration.migrate(buffer)}}catch(error){return apiError(reply,error)}})
  app.get('/api/admin/export/template',async(_,reply)=>sendWorkbook(reply,excel.template(),'auth-codes-template.xlsx'))
  app.get('/api/admin/export/assigned',async(_,reply)=>sendWorkbook(reply,excel.exportAssigned(),'assigned-auth-codes.xlsx'))
  app.get('/api/admin/export/logs',async(_,reply)=>sendWorkbook(reply,excel.exportLogs(),'audit-logs.xlsx'))

  if(existsSync(config.publicDir)){await app.register(fastifyStatic,{root:config.publicDir,wildcard:false});app.setNotFoundHandler((request,reply)=>{if(request.method==='GET'&&!request.url.startsWith('/api/'))return reply.sendFile('index.html');return reply.code(404).send({success:false,message:'接口不存在'})})}
  return app
}

async function devicePayload(request:FastifyRequest):Promise<Record<string,unknown>>{
  const query=request.query&&typeof request.query==='object'?request.query as Record<string,unknown>:{}
  if(request.isMultipart()){const data:Record<string,unknown>={...query};for await(const part of request.parts()){if(part.type==='field')data[part.fieldname]=part.value;else part.file.resume()}return data}
  const body=request.body
  if(body&&typeof body==='object')return {...query,...body as Record<string,unknown>}
  if(typeof body==='string')return {...query,...parseDeviceText(body)}
  return query
}

/** Keep the device boundary tolerant: embedded clients often cannot send standard JSON. */
function parseDeviceText(body:string):Record<string,string>{
  const text=body.trim();if(!text)return {}
  try{const parsed=JSON.parse(text);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return Object.fromEntries(Object.entries(parsed).map(([key,value])=>[key,String(value??'')]))}catch{}
  const xml:Record<string,string>={};for(const key of ['mac','pid']){const match=text.match(new RegExp(`<${key}[^>]*>([^<]*)</${key}>`,'i'));if(match)xml[key]=match[1].trim()}if(Object.keys(xml).length)return xml
  const params=new URLSearchParams(text.replace(/\r?\n/g,'&'));if(params.has('mac')||params.has('pid'))return Object.fromEntries(params.entries())
  const values:Record<string,string>={};for(const line of text.split(/[&\r\n]+/)){const match=line.match(/^\s*(mac|pid)\s*[:=]\s*(.*?)\s*$/i);if(match)values[match[1].toLowerCase()]=match[2]}return values
}
async function uploaded(request:FastifyRequest){const fields:Record<string,string>={};let buffer:Buffer|undefined;for await(const part of request.parts()){if(part.type==='file')buffer=await part.toBuffer();else fields[part.fieldname]=String(part.value)}if(!buffer)throw new Error('请选择文件');return {buffer,fields}}
function apiError(reply:FastifyReply,error:unknown){const typed=error as Error&{details?:string[]};const message=typed.message;const conflict=message.includes('UNIQUE constraint failed');return reply.code(conflict?409:400).send({success:false,message:conflict?'同一 PID 下的 DID 不能重复':message,errors:typed.details})}
function sendWorkbook(reply:FastifyReply,buffer:Buffer,name:string){return reply.header('content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('content-disposition',`attachment; filename="${name}"`).send(buffer)}
function logDeviceExchange(request:FastifyRequest,reply:FastifyReply,payload:unknown,parsedBody?:Record<string,unknown>){let responseBody=payload;try{if(typeof payload==='string')responseBody=JSON.parse(payload)}catch{}const record={time:new Date().toISOString(),request:{method:request.method,url:request.url,ip:request.ip,headers:request.headers,query:request.query,body:parsedBody??request.body??null},response:{statusCode:reply.statusCode,headers:reply.getHeaders(),body:responseBody}};console.log(`[设备授权请求]\n${JSON.stringify(record,null,2)}`)}
