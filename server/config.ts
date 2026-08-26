import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { isSea } from 'node:sea'

export interface AppConfig {
  appName: string; host: string; port: number; adminUser: string; adminPassword: string
  dataDir: string; databasePath: string; publicDir: string
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  const inline = process.argv.find((item) => item.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

/** CLI > environment > build-time default. Keep credentials out of the database. */
export function loadConfig(): AppConfig {
  const runtimeDir=isSea()?dirname(process.execPath):process.cwd()
  const dataDir = resolve(argument('data-dir') ?? process.env.AUTH_PLATFORM_DATA_DIR ?? resolve(runtimeDir,'data'))
  const config: AppConfig = {
    appName: process.env.AUTH_PLATFORM_NAME ?? '授权码分发平台',
    host: argument('host') ?? process.env.AUTH_PLATFORM_HOST ?? '0.0.0.0',
    port: Number(argument('port') ?? process.env.AUTH_PLATFORM_PORT ?? 8080),
    adminUser: argument('admin-user') ?? process.env.AUTH_PLATFORM_ADMIN_USER ?? 'admin',
    adminPassword: argument('admin-password') ?? process.env.AUTH_PLATFORM_ADMIN_PASSWORD ?? 'Abcd+123',
    dataDir,
    databasePath: resolve(dataDir, 'auth-platform.db'),
    publicDir: resolve(process.env.AUTH_PLATFORM_PUBLIC_DIR ?? (isSea()?resolve(runtimeDir,'public'):resolve(runtimeDir,'dist','public'))),
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('端口必须在 1-65535 之间')
  if (!config.adminUser || !config.adminPassword) throw new Error('管理员用户名和密码不能为空')
  mkdirSync(config.dataDir, { recursive: true })
  return config
}
