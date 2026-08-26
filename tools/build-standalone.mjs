import {copyFileSync,cpSync,existsSync,mkdirSync,rmSync,writeFileSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
import {build} from 'esbuild'

const root=resolve(import.meta.dirname,'..'),buildDir=join(root,'build','standalone'),releaseDir=join(root,'release','AuthCodePlatform')
rmSync(buildDir,{recursive:true,force:true});rmSync(releaseDir,{recursive:true,force:true});mkdirSync(buildDir,{recursive:true});mkdirSync(releaseDir,{recursive:true})
const packageManagerCli=process.env.npm_execpath
if(!packageManagerCli)throw new Error('请通过 yarn package:standalone 执行打包')
execFileSync(process.execPath,[packageManagerCli,'run','build'],{cwd:root,stdio:'inherit'})
const bundle=join(buildDir,'application.cjs')
await build({entryPoints:[join(root,'server','main.ts')],bundle:true,platform:'node',target:'node22',format:'cjs',outfile:bundle,banner:{js:'globalThis.require = require;'},external:['node:sqlite','node:sea']})
const seaConfig=join(buildDir,'sea-config.json'),blob=join(buildDir,'application.blob')
writeFileSync(seaConfig,JSON.stringify({main:bundle,output:blob,disableExperimentalSEAWarning:true,useSnapshot:false,useCodeCache:false}))
execFileSync(process.execPath,['--experimental-sea-config',seaConfig],{stdio:'inherit'})
const executable=join(releaseDir,process.platform==='win32'?'AuthCodePlatform.exe':'AuthCodePlatform')
copyFileSync(process.execPath,executable)
const args=[executable,'NODE_SEA_BLOB',blob,'--sentinel-fuse','NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2']
if(process.platform==='darwin')args.push('--macho-segment-name','NODE_SEA')
execFileSync(process.execPath,[join(root,'node_modules','postject','dist','cli.js'),...args],{stdio:'inherit'})
cpSync(join(root,'dist','public'),join(releaseDir,'public'),{recursive:true})
cpSync(join(root,'deploy'),join(releaseDir,'deploy'),{recursive:true})
copyFileSync(join(root,'config.example.json'),join(releaseDir,'config.example.json'))
console.log(`Standalone package created: ${releaseDir}`)
