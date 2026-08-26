# 授权码分发平台：项目交接记忆

本文是仓库级长期上下文。后续维护者或 AI 开始修改前，应先阅读本文和 `README.md`，并以现有测试所固定的接口行为为准。

## 1. 项目目标与业务边界

- 本项目已从 Python 应用彻底迁移为 Node.js + TypeScript 服务端、Vue 3 + Element Plus 管理端。
- 程序是无窗口化 HTTP 服务，不使用 Electron。管理后台和设备分发接口共用同一个监听端口。
- 优先支持 Windows、Linux，并尽量保持全平台可运行。
- 对旧系统只要求设备网络分发接口行为兼容；后台、内部实现和数据库结构可以重构。
- 只存在一个管理员账号。账号密码不在后台维护，通过启动参数或环境变量传入。
- 当前只提供 HTTP，不包含 HTTPS。
- 不维护设备白名单。设备提交什么 PID，就从该 PID 的库存或既有分配记录中返回数据。
- PID 被编辑后不需要与原 PID 保持关联。
- 已有授权码的编辑、解除绑定和删除操作都必须要求管理员再次输入密码确认，并由服务端强制校验；新增和批量导入不属于编辑操作。
- 串口、USB 等本地分发暂未实现；扩展边界位于 `server/hardware/adapter.ts`。

## 2. 技术栈与目录职责

- `server/`：Fastify 服务、业务服务、数据仓储、SQLite、运行时逻辑。
- `web/`：Vue 3 管理后台，统一使用 Element Plus 和项目 Design System。
- `shared/`：前后端共享契约。
- `tests/`：Vitest 自动化测试，尤其用于锁定设备接口兼容行为。
- `tools/`：独立可执行程序打包脚本。
- `deploy/`：Windows 服务和 Linux systemd 部署示例。
- 数据库使用 Node.js 内置 `node:sqlite`，要求 Node.js >= 22.5.0。出现 SQLite experimental warning 属于当前 Node 运行时提示。
- 包管理器固定为 Yarn 1.22；不要提交 `package-lock.json`，也不要改用 npm 命令。

## 3. 开发、验证与打包

```text
yarn install
yarn dev
yarn typecheck
yarn test
yarn build
yarn package:standalone
```

- `yarn dev` 会先构建 Web，再以 watch 模式运行服务端。
- `yarn package:standalone` 生成无需目标机器安装 Node.js 的独立发行目录 `release/AuthCodePlatform/`。
- 发行包包含可执行文件、`public/` 和部署文件，不包含 `README.md`。
- `release/` 为生成物，不提交 Git。Windows 打包时可能出现签名相关警告，不影响未签名内部发行。
- 改动设备分发、库存分配或数据库逻辑后，至少运行 `yarn typecheck` 和 `yarn test`；发版前再运行独立打包。

## 4. 启动配置与端口行为

命令行参数优先于环境变量，环境变量优先于默认值：

```text
AuthCodePlatform --host 0.0.0.0 --port 8080 --admin-user admin --admin-password "your-password" --data-dir ./data
```

对应环境变量：

- `AUTH_PLATFORM_HOST`
- `AUTH_PLATFORM_PORT`
- `AUTH_PLATFORM_ADMIN_USER`
- `AUTH_PLATFORM_ADMIN_PASSWORD`
- `AUTH_PLATFORM_DATA_DIR`
- `AUTH_PLATFORM_NAME`
- `AUTH_PLATFORM_PUBLIC_DIR`

默认监听 `0.0.0.0:8080`。若请求端口因占用或 Windows 保留端口而返回 `EADDRINUSE`/`EACCES`，服务会从该端口向上逐个尝试，并在启动日志中打印本机所有可访问 IP 和最终端口。管理后台直接访问其中任一 URL。

## 5. 不可破坏的设备接口行为

核心接口为 `POST /api/device/authorize`：

- 接收 `mac`、`pid`，兼容 JSON、URL encoded form、multipart form，并保留查询参数兜底。
- MAC 会标准化；PID 之间库存严格隔离。
- 同一 PID + MAC 已分配过时，重复请求必须返回原记录，不能再消耗库存。
- 首次分配按记录 ID FIFO 领取该 PID 的可用库存。
- 库存不足返回 HTTP 409；缺字段或 MAC 非法返回 HTTP 400。
- 保留 CORS 预检及 `Access-Control-Allow-Origin: *`。
- 响应字段与文案已经由 `tests/device-api.test.ts` 固定。调整接口前必须先理解现有测试，除非用户明确授权改变兼容行为。

## 6. 数据与迁移

- 默认新库为数据目录下的 `auth-platform.db`。
- 核心数据包括授权库存、PID + DID 唯一关系、可用/已分配状态、绑定 MAC、分配时间、来源批次和完整载荷。
- `pid_metadata` 保存 PID 的产品备注；审计/请求信息存入 `audit_logs`。
- 旧库通过后台“旧数据库迁移”页面上传，由 `/api/admin/migrate` 导入。
- 旧库只迁移授权库存和已分配关系，不迁移旧请求日志或白名单。
- 导入遇到新库已有的 PID + DID 时跳过，并向管理员报告冲突；不覆盖已有数据。

## 7. 当前管理后台功能

- 运行总览。
- PID 清单：汇总系统中全部 PID；点击产品备注即可行内编辑；“查看数据”跳转到 `/inventory?pid=...` 并自动筛选。
- 授权码管理：查询、新增、编辑、删除、解除绑定；PID 有备注时附带显示。
- 批量导入导出。
- 分配记录：只展示成功分配数据，按 `assigned_at DESC, id DESC` 排列。
- 操作与请求记录：PID 有备注时附带显示。
- 旧数据库迁移。
- 分配记录和操作与请求记录默认每 5 秒自动刷新；可在页面关闭。标签页隐藏或组件卸载时暂停，恢复可见后立即刷新，并避免并发重复请求。

## 8. 前端与代码约定

- 整体视觉为浅色、低饱和、现代企业工具风格；Sidebar 固定宽度 232px。
- 统一复用 `web/components/` 中的页面标题、卡片等组件及 `web/styles/design-system.css`，不要在各页面创建互相冲突的视觉体系。
- 页面按路由动态导入，避免重新引入大体积单包警告。
- 业务按配置、路由/应用组装、服务、仓储、数据库、硬件适配层拆分。新增功能应进入对应职责文件，不要堆入单一入口。
- 对接口兼容、事务边界、端口回退、硬件适配等关键决策添加说明性注释；避免注释显而易见的语法。

## 9. Git 状态与维护原则

- 重构分支为 `node-vue-refactor`。
- 不恢复已删除的旧 Python 项目文件，除非用户明确要求查阅历史版本。
- 提交前检查 `git diff --check`、类型检查和测试；只提交源代码及必要文档，不提交本地数据库、密钥、构建缓存或发行生成物。
- 若本文与代码或测试不一致，应先核实近期变更；完成新的架构或业务决策后同步更新本文，避免后续上下文再次丢失。
