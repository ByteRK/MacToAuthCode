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
import { AuthService } from './services/auth-service.js'
import { DistributionService } from './services/distribution-service.js'
import { InventoryService } from './services/inventory-service.js'
import { ExcelService } from './services/excel-service.js'
import { MigrationService } from './services/migration-service.js'
import { PidService } from './services/pid-service.js'

const numberParam=(value:unknown,fallback:number,min=1,max=100)=>Math.min(Math.max(Number(value)||fallback,min),max)

export async function buildApp(config:AppConfig,database=new Database(config.databasePath)) {
  const app=Fastify({logger:true,bodyLimit:50*1024*1024});await app.register(cookie);await app.register(formbody);await app.register(multipart,{limits:{fileSize:50*1024*1024}})
  // The legacy endpoint accepted uncommon content types and then fell back to query parameters.
  app.addContentTypeParser('*',{parseAs:'string'},(_request,body,done)=>done(null,body))
  const repo=new AuthCodeRepository(database);const audit=new AuditService(database);const auth=new AuthService(config);const distribution=new DistributionService(repo,audit);const inventory=new InventoryService(repo,audit,config.adminPassword);const excel=new ExcelService(repo,audit);const migration=new MigrationService(repo,audit);const pids=new PidService(database,audit)
  app.addHook('onClose',()=>database.close())
  app.addHook('onSend',async(request,reply,payload)=>{if(request.url.startsWith('/api/device/')){reply.headers({'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type, Authorization','access-control-max-age':'86400'})}return payload})
  app.options('/api/device/authorize',async(_,reply)=>reply.code(204).send())
  app.post('/api/device/authorize',async(request,reply)=>{const data=await devicePayload(request);const mac=String(data.mac??'').trim();const pid=String(data.pid??'').trim();if(!mac)return reply.code(400).send({success:false,message:'请求体缺少 mac 字段'});if(!pid)return reply.code(400).send({success:false,message:'请求体缺少 pid 字段'});try{const result=distribution.distribute(mac,pid,request.ip);return reply.code(result.status).send(result.body)}catch(error){return reply.code(400).send({success:false,message:(error as Error).message})}})
  app.get('/healthz',async()=>({success:true,message:'ok'}))

  app.post('/api/admin/login',async(request,reply)=>{const body=request.body as Record<string,string>;if(!auth.verifyCredentials(body?.username??'',body?.password??''))return reply.code(401).send({success:false,message:'用户名或密码错误'});reply.setCookie('auth_session',auth.issue(),{httpOnly:true,sameSite:'strict',path:'/'});return {success:true,data:{username:body.username}}})
  app.post('/api/admin/logout',async(_,reply)=>{reply.clearCookie('auth_session',{path:'/'});return {success:true}})
  app.addHook('preHandler',async(request,reply)=>{if(request.url.startsWith('/api/admin/')&&!request.url.startsWith('/api/admin/login')&&!auth.verify(request.cookies.auth_session))return reply.code(401).send({success:false,message:'未登录或登录已失效'})})
  app.get('/api/admin/session',async()=>({success:true,data:{username:config.adminUser}}))
  app.get('/api/admin/overview',async()=>({success:true,data:{summary:repo.summary()}}))
  app.get('/api/admin/pids',async(request)=>{const q=request.query as Record<string,string>;return {success:true,data:pids.list({page:numberParam(q.page,1),pageSize:numberParam(q.pageSize,20),search:q.search??''})}})
  app.put('/api/admin/pids/:pid/remark',async(request,reply)=>{try{return {success:true,data:pids.updateRemark(decodeURIComponent((request.params as {pid:string}).pid),String((request.body as {remark?:string})?.remark??''))}}catch(error){return apiError(reply,error)}})
  app.get('/api/admin/codes',async(request)=>{const q=request.query as Record<string,string>;return {success:true,data:repo.list({page:numberParam(q.page,1),pageSize:numberParam(q.pageSize??q.page_size,20),search:q.search,status:q.status,pid:q.pid})}})
  app.get('/api/admin/allocations',async(request)=>{const q=request.query as Record<string,string>;return {success:true,data:repo.listAllocations({page:numberParam(q.page,1),pageSize:numberParam(q.pageSize,20),search:q.search})}})
  app.post('/api/admin/codes',async(request,reply)=>{try{return {success:true,data:inventory.create(request.body as never)}}catch(error){return apiError(reply,error)}})
  app.put('/api/admin/codes/:id',async(request,reply)=>{try{const body=request.body as Record<string,unknown>;return {success:true,data:inventory.update(Number((request.params as {id:string}).id),body as never,String(body.password??''))}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/codes/:id/unbind',async(request,reply)=>{try{const body=request.body as {password?:string};return {success:true,data:inventory.unbind(Number((request.params as {id:string}).id),body?.password??'')}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/codes/delete',async(request,reply)=>{try{const body=request.body as {ids:number[];password:string};return {success:true,data:inventory.delete(body.ids??[],body.password??'')}}catch(error){return apiError(reply,error)}})
  app.get('/api/admin/logs',async(request)=>{const q=request.query as Record<string,string>;return {success:true,data:{items:audit.list(numberParam(q.limit,50,5,1000),q.action,q.search)}}})
  app.post('/api/admin/import/preview',async(request,reply)=>{try{const {buffer,fields}=await uploaded(request);return {success:true,data:excel.preview(buffer,fields.sourceBatch??fields.source_batch??'',fields.defaultPid??fields.default_pid??'')}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/import',async(request,reply)=>{try{const {buffer,fields}=await uploaded(request);return {success:true,data:excel.import(buffer,fields.sourceBatch??fields.source_batch??'',fields.defaultPid??fields.default_pid??'')}}catch(error){return apiError(reply,error)}})
  app.post('/api/admin/migrate',async(request,reply)=>{try{const {buffer}=await uploaded(request);return {success:true,data:migration.migrate(buffer)}}catch(error){return apiError(reply,error)}})
  app.get('/api/admin/export/template',async(_,reply)=>sendWorkbook(reply,excel.template(),'auth-codes-template.xlsx'))
  app.get('/api/admin/export/assigned',async(_,reply)=>sendWorkbook(reply,excel.exportAssigned(),'assigned-auth-codes.xlsx'))
  app.get('/api/admin/export/logs',async(_,reply)=>sendWorkbook(reply,excel.exportLogs(),'audit-logs.xlsx'))

  if(existsSync(config.publicDir)){await app.register(fastifyStatic,{root:config.publicDir,wildcard:false});app.setNotFoundHandler((request,reply)=>{if(request.method==='GET'&&!request.url.startsWith('/api/'))return reply.sendFile('index.html');return reply.code(404).send({success:false,message:'接口不存在'})})}
  return app
}

async function devicePayload(request:FastifyRequest):Promise<Record<string,unknown>>{if(request.isMultipart()){const data:Record<string,unknown>={};for await(const part of request.parts()){if(part.type==='field')data[part.fieldname]=part.value;else part.file.resume()}return data}const body=request.body;if(body&&typeof body==='object')return body as Record<string,unknown>;const query=request.query;if(query&&typeof query==='object'&&Object.keys(query as object).length)return query as Record<string,unknown>;return {}}
async function uploaded(request:FastifyRequest){const fields:Record<string,string>={};let buffer:Buffer|undefined;for await(const part of request.parts()){if(part.type==='file')buffer=await part.toBuffer();else fields[part.fieldname]=String(part.value)}if(!buffer)throw new Error('请选择文件');return {buffer,fields}}
function apiError(reply:FastifyReply,error:unknown){const typed=error as Error&{details?:string[]};const message=typed.message;const conflict=message.includes('UNIQUE constraint failed');return reply.code(conflict?409:400).send({success:false,message:conflict?'同一 PID 下的 DID 不能重复':message,errors:typed.details})}
function sendWorkbook(reply:FastifyReply,buffer:Buffer,name:string){return reply.header('content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('content-disposition',`attachment; filename="${name}"`).send(buffer)}
