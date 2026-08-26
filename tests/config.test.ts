import{mkdirSync,mkdtempSync,rmSync,writeFileSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{afterEach,describe,expect,it}from'vitest'
import{loadConfig}from'../server/config.js'

describe('runtime configuration precedence',()=>{
  const dirs:string[]=[]
  afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true})})
  const workspace=()=>{const dir=mkdtempSync(join(tmpdir(),'auth-config-test-'));dirs.push(dir);return dir}

  it('uses CLI over environment over config.json over defaults',()=>{
    const dir=workspace();writeFileSync(join(dir,'config.json'),JSON.stringify({host:'file-host',port:7000,adminUser:'file-user',adminPassword:'file-pass',dataDir:'file-data'}))
    const config=loadConfig({cwd:dir,sea:false,argv:['node','app','--host','cli-host','--port=9000','--debug'],env:{AUTH_PLATFORM_HOST:'env-host',AUTH_PLATFORM_ADMIN_USER:'env-user'}})
    expect(config).toMatchObject({host:'cli-host',port:9000,adminUser:'env-user',adminPassword:'file-pass',dataDir:join(dir,'file-data'),debug:true})
  })

  it('supports an explicit config path and resolves its paths relative to that file',()=>{
    const dir=workspace(),settings=join(dir,'settings');mkdirSync(settings)
    writeFileSync(join(settings,'custom.json'),JSON.stringify({port:8123,adminPassword:'secret',dataDir:'storage',publicDir:'assets'}))
    const config=loadConfig({cwd:dir,sea:false,argv:['node','app','--config','settings/custom.json'],env:{}})
    expect(config).toMatchObject({port:8123,dataDir:join(settings,'storage'),publicDir:join(settings,'assets')})
  })

  it('ignores a missing default file but rejects a missing explicit file',()=>{
    const dir=workspace();expect(loadConfig({cwd:dir,sea:false,argv:['node','app'],env:{}}).port).toBe(8080)
    expect(()=>loadConfig({cwd:dir,sea:false,argv:['node','app','--config','missing.json'],env:{}})).toThrow('配置文件不存在')
  })
})
