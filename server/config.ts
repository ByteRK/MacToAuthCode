import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { isSea as runtimeIsSea } from 'node:sea'

export interface AppConfig {
  appName: string; host: string; port: number; adminUser: string; adminPassword: string
  dataDir: string; databasePath: string; publicDir: string
}

interface FileConfig {
  appName?:string;host?:string;port?:number|string;adminUser?:string;adminPassword?:string;dataDir?:string;publicDir?:string
}

export interface ConfigLoadOptions {
  argv?:string[];env?:NodeJS.ProcessEnv;cwd?:string;execPath?:string;sea?:boolean
}

function argument(name:string,argv:string[]):string|undefined {
  const prefix=`--${name}=`;const inline=argv.find(item=>item.startsWith(prefix))
  if(inline)return inline.slice(prefix.length)
  const index=argv.indexOf(`--${name}`),value=index>=0?argv[index+1]:undefined
  return value&&!value.startsWith('--')?value:undefined
}

function readJsonConfig(path:string,required:boolean):FileConfig {
  if(!existsSync(path)){if(required)throw new Error(`配置文件不存在：${path}`);return {}}
  let parsed:unknown
  try{parsed=JSON.parse(readFileSync(path,'utf8'))}catch(error){throw new Error(`配置文件 JSON 格式不正确：${path}（${(error as Error).message}）`)}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error(`配置文件必须是 JSON 对象：${path}`)
  const config=parsed as Record<string,unknown>
  for(const key of ['appName','host','adminUser','adminPassword','dataDir','publicDir'])if(config[key]!==undefined&&typeof config[key]!=='string')throw new Error(`配置项 ${key} 必须是字符串`)
  if(config.port!==undefined&&typeof config.port!=='number'&&typeof config.port!=='string')throw new Error('配置项 port 必须是数字')
  return config as FileConfig
}

/** CLI > environment > JSON file > built-in defaults. Credentials never enter the database. */
export function loadConfig(options:ConfigLoadOptions={}):AppConfig {
  const argv=options.argv??process.argv,env=options.env??process.env,cwd=options.cwd??process.cwd(),sea=options.sea??runtimeIsSea()
  const runtimeDir=sea?dirname(options.execPath??process.execPath):cwd
  const explicitConfig=argument('config',argv),hasConfigArgument=argv.some(item=>item==='--config'||item.startsWith('--config='))
  if(hasConfigArgument&&!explicitConfig)throw new Error('--config 必须指定 JSON 文件路径')
  const configPath=explicitConfig?resolve(cwd,explicitConfig):resolve(runtimeDir,'config.json')
  const file=readJsonConfig(configPath,explicitConfig!==undefined),configDir=dirname(configPath)
  const cliDataDir=argument('data-dir',argv),envDataDir=env.AUTH_PLATFORM_DATA_DIR
  const dataDir=cliDataDir?resolve(cwd,cliDataDir):envDataDir?resolve(cwd,envDataDir):file.dataDir?resolve(configDir,file.dataDir):resolve(runtimeDir,'data')
  const cliPublicDir=argument('public-dir',argv),envPublicDir=env.AUTH_PLATFORM_PUBLIC_DIR
  const publicDir=cliPublicDir?resolve(cwd,cliPublicDir):envPublicDir?resolve(cwd,envPublicDir):file.publicDir?resolve(configDir,file.publicDir):(sea?resolve(runtimeDir,'public'):resolve(runtimeDir,'dist','public'))
  const config:AppConfig={
    appName:argument('app-name',argv)??env.AUTH_PLATFORM_NAME??file.appName??'授权码分发平台',
    host:argument('host',argv)??env.AUTH_PLATFORM_HOST??file.host??'0.0.0.0',
    port:Number(argument('port',argv)??env.AUTH_PLATFORM_PORT??file.port??8080),
    adminUser:argument('admin-user',argv)??env.AUTH_PLATFORM_ADMIN_USER??file.adminUser??'admin',
    adminPassword:argument('admin-password',argv)??env.AUTH_PLATFORM_ADMIN_PASSWORD??file.adminPassword??'Abcd+123',
    dataDir,databasePath:resolve(dataDir,'auth-platform.db'),publicDir,
  }
  if(!Number.isInteger(config.port)||config.port<1||config.port>65535)throw new Error('端口必须在 1-65535 之间')
  if(!config.appName.trim())throw new Error('系统名称不能为空')
  if(!config.host.trim())throw new Error('监听地址不能为空')
  if(!config.adminUser||!config.adminPassword)throw new Error('管理员用户名和密码不能为空')
  mkdirSync(config.dataDir,{recursive:true})
  return config
}
