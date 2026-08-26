import { networkInterfaces } from 'node:os'
import type { FastifyInstance } from 'fastify'

const RETRYABLE_LISTEN_ERRORS=new Set(['EADDRINUSE','EACCES'])

/**
 * Bind from the requested port upwards. This also handles Windows reserved port
 * ranges, which report EACCES even though no process appears to own the port.
 */
export async function listenWithPortFallback(app:FastifyInstance,host:string,requestedPort:number){
  let lastError:unknown
  for(let port=requestedPort;port<=65535;port+=1){
    try{await app.listen({host,port});return {port,adjusted:port!==requestedPort}}
    catch(error){
      lastError=error
      if(!RETRYABLE_LISTEN_ERRORS.has((error as NodeJS.ErrnoException).code??''))throw error
    }
  }
  throw lastError??new Error(`从端口 ${requestedPort} 开始没有找到可用端口`)
}

export function buildAccessUrls(host:string,port:number){
  if(host!=='0.0.0.0'&&host!=='::')return [`http://${formatHost(host)}:${port}`]
  const addresses=new Set<string>(['127.0.0.1'])
  for(const entries of Object.values(networkInterfaces())){
    for(const entry of entries??[]){
      if(!entry.internal&&(entry.family==='IPv4'||entry.family==='IPv6'))addresses.add(entry.address)
    }
  }
  return [...addresses].map(address=>`http://${formatHost(address)}:${port}`)
}

function formatHost(host:string){return host.includes(':')?`[${host}]`:host}
