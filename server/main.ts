import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { buildAccessUrls,listenWithPortFallback } from './runtime/network.js'

async function main(){
  const config=loadConfig();const app=await buildApp(config)
  try{
    const listening=await listenWithPortFallback(app,config.host,config.port)
    if(listening.adjusted)console.warn(`端口 ${config.port} 不可用，已自动切换到端口 ${listening.port}。`)
    console.log(`${config.appName} 已启动，可通过以下地址访问：\n${buildAccessUrls(config.host,listening.port).join('\n')}`)
  }catch(error){
    app.log.error(error)
    process.exit(1)
  }
}
main().catch((error)=>{console.error(error);process.exit(1)})
