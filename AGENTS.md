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
- 已有授权码的编辑、解除绑定和删除操作都必须要求管理员再次输入独立的授权码操作密码确认，并由服务端强制校验；新增和批量导入不属于编辑操作。
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

运行配置优先级固定为：命令行参数 > 环境变量 > JSON 配置文件 > 内置默认值。默认读取程序所在目录的 `config.json`，`--config <路径>` 可指定其他文件；配置字段和示例见 `config.example.json`。

管理员登录密码与授权码操作密码必须独立配置。授权码编辑、删除和解除绑定的二次确认统一校验 `operationPassword`，不得回退校验管理员登录密码。

```text
AuthCodePlatform --host 0.0.0.0 --port 8080 --admin-user admin --admin-password "your-login-password" --operation-password "your-operation-password" --data-dir ./data
```

对应环境变量：

- `AUTH_PLATFORM_HOST`
- `AUTH_PLATFORM_PORT`
- `AUTH_PLATFORM_ADMIN_USER`
- `AUTH_PLATFORM_ADMIN_PASSWORD`
- `AUTH_PLATFORM_OPERATION_PASSWORD`
- `AUTH_PLATFORM_DATA_DIR`
- `AUTH_PLATFORM_NAME`
- `AUTH_PLATFORM_PUBLIC_DIR`
- `AUTH_PLATFORM_DEBUG`

默认关闭 Fastify 全量访问日志，只格式化打印 `/api/device/authorize` 的完整请求与响应。`--debug`、`AUTH_PLATFORM_DEBUG=true` 或配置文件 `debug: true` 会启用全部 Web 请求日志，仍遵循统一配置优先级。

默认监听 `0.0.0.0:8080`。若请求端口因占用或 Windows 保留端口而返回 `EADDRINUSE`/`EACCES`，服务会从该端口向上逐个尝试，并在启动日志中打印本机所有可访问 IP 和最终端口。管理后台直接访问其中任一 URL。

## 5. 不可破坏的设备接口行为

核心接口为 `POST /api/device/authorize`：

- 接收 `mac`、`pid`，兼容 JSON、URL encoded form、multipart form、URL 查询参数、纯文本键值对、简单 XML，以及非标准 Content-Type 下的 JSON；允许请求体字段覆盖查询参数。
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
- PID 清单：按 PID 不区分大小写升序排列；点击产品备注即可行内编辑；库存 `>10` 为绿色、`1-10` 为黄色、`0` 为红色；可输入 MAC 直接调用设备接口申请授权码；“查看数据”跳转到 `/inventory?pid=...` 并自动筛选。
- 授权码管理：查询、新增、编辑、删除、解除绑定；PID 有备注时附带显示。已分配记录禁止编辑，必须先解除绑定；保存编辑时服务端预检 PID + DID 唯一关系。编辑弹窗会高亮相对原记录发生变化的字段，并可一键重置本次编辑。
- 批量导入导出：模板保留 `pid`、`did`、`license` 三列，其他列进入自定义载荷；若导入文件完全没有 `pid` 列，可使用页面填写的默认 PID。批次在页面填写，留空则按本机当前时间生成 `yyyyMMdd_HHmm`。写入前预检查重复项，并区分现有未分配、现有已分配及文件内重复，只在管理员确认后导入剩余项。
- CIOT 源导入：使用独立页面、接口和 `CiotImportService`，不可混入常规 Excel 解析逻辑。页面 PID 必填；`sn码` 映射 DID、`许可证` 映射 License，不导入申请流水号和源状态到自定义载荷。任一源状态不是“未激活”时列出异常并拒绝整批；全部未激活后沿用重复项预检查与剩余项确认体验。批次规则与常规导入相同。页面还可将源文件纯转换为常规批量导入所需的 `pid`、`did`、`license` 三列表格；转换包含全部源记录，非“未激活”项只警告不阻止，并且不得查询或修改库存、不得写审计日志。
- ADB 授权写入：服务端不内置 ADB，要求宿主机 `PATH` 中存在 `adb`；页面每 3 秒检测设备并支持多设备选择。网卡名称支持常用下拉项和自定义输入，读取 `/sys/class/net/<网卡>/address` 后必须调用 `DistributionService` 走常规 PID + MAC 分配流程。模板固定支持 `{{pid}}`、`{{did}}`、`{{license}}`，目标为设备端完整路径；`adb push` 后必须执行所选设备的 `adb shell sync`。分配后推送或同步失败不得退回授权码，必须记录说明其保持分配；成功和失败均进入审计日志。重启所选设备前需要弹窗二次确认，但不要求密码且不写审计日志。页面设置仅通过浏览器 `localStorage` 保留。
- 分配记录：只展示成功分配数据，按 `assigned_at DESC, id DESC` 排列。
- 操作与请求记录：PID 有备注时附带显示；动作类型支持多选组合筛选。
- 旧数据库迁移。
- 分配记录和操作与请求记录默认每 5 秒自动刷新；可在页面关闭。标签页隐藏或组件卸载时暂停，恢复可见后立即刷新，并避免并发重复请求。

## 8. 前端与代码约定

- 整体视觉为浅色、低饱和、现代企业工具风格；Sidebar 固定宽度 232px。
- 统一复用 `web/components/` 中的页面标题、卡片等组件及 `web/styles/design-system.css`，不要在各页面创建互相冲突的视觉体系。
- 所有数据表格首列统一显示“序号”；分页表格按页码和每页数量计算连续序号，无分页表格按当前展示顺序编号。
- 授权码管理的 PID、状态、搜索词、页码和每页数量必须同步到 URL，数据编辑、解除绑定、删除和浏览器刷新后不得丢失筛选上下文；删除弹窗打开时必须锁定待删除 ID 快照，不能依赖后续可能变化的表格选中状态。
- 页面按路由动态导入，避免重新引入大体积单包警告。
- 业务按配置、路由/应用组装、服务、仓储、数据库、硬件适配层拆分。新增功能应进入对应职责文件，不要堆入单一入口。
- 对接口兼容、事务边界、端口回退、硬件适配等关键决策添加说明性注释；避免注释显而易见的语法。

## 9. Git 状态与维护原则

- 日常开发与后续更新统一在 `master` 分支进行；`python-refactor` 仅保存重构前的 Python 实现，`node-vue-refactor` 为已合并的历史重构分支。
- 推送任意 Git 标签会触发 `.github/workflows/build-on-tag.yml`，在 Windows、Linux、macOS 分别构建独立发行包，并创建或更新对应 GitHub Release。
- 如果需求存在不明确、相互冲突或会产生多种业务结果的地方，必须及时向用户确认后再实现相关部分，不要自行猜测关键业务规则。
- 不恢复已删除的旧 Python 项目文件，除非用户明确要求查阅历史版本。
- 提交前检查 `git diff --check`、类型检查和测试；只提交源代码及必要文档，不提交本地数据库、密钥、构建缓存或发行生成物。
- 若本文与代码或测试不一致，应先核实近期变更；完成新的架构或业务决策后同步更新本文，避免后续上下文再次丢失。
