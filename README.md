# 授权码分发平台

基于 Node.js、TypeScript、Vue 3、Element Plus 和 SQLite 的无窗口授权码分发服务。程序监听指定端口，本机或局域网设备通过浏览器进入管理后台，设备通过 HTTP API领取授权数据。

## 核心能力

- `POST /api/device/authorize`兼容旧版设备请求和响应。
- 按 PID隔离库存，同一 `PID + MAC`重复请求返回当前已分配记录。
- FIFO分配、并发事务保护、库存不足记录。
- 授权码新增、编辑、批量删除、解除绑定与完整审计。
- Excel模板、整表校验导入、分配记录和审计日志导出。
- ADB 设备持续检测、按设备网卡 MAC 分配授权码，并通过文本模板写入设备文件。
- 上传旧版 `auth_codes.db`迁移库存与已分配关系。
- Windows、Linux和 macOS独立构建，目标机器无需安装 Node.js。
- 为串口/USB分发预留隔离的 Hardware Adapter接口。

## 开发

要求 Node.js 22.5或更高版本。

```bash
yarn install
yarn dev
```

- 管理后台和设备接口统一使用：`http://localhost:8080`
- 默认开发账号：`admin / Abcd+123`

生产构建与测试：

```bash
yarn typecheck
yarn test
yarn build
```

## 启动参数

```bash
AuthCodePlatform --config ./config.json --host 0.0.0.0 --port 8080 --admin-user admin --admin-password "your-login-password" --operation-password "your-operation-password" --data-dir ./data
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

默认读取程序所在目录的 `config.json`，也可通过 `--config <路径>` 指定文件。字段参考 `config.example.json`。配置文件中的相对数据和 Web 目录以配置文件所在目录为基准；显式指定但不存在或格式错误时，程序会拒绝启动。

优先级为命令行参数、环境变量、JSON 配置文件、内置默认值。管理员登录密码与授权码操作密码互相独立；编辑、删除和解除绑定使用操作密码进行二次确认。生产环境必须分别设置强密码。管理后台仅使用 HTTP，适用于可信局域网。

默认仅在终端格式化打印 `/api/device/authorize` 的完整请求和完整响应。传入 `--debug`（或设置 `AUTH_PLATFORM_DEBUG=true`、配置文件 `"debug": true`）后，额外启用全部 HTTP 请求的 Fastify 调试日志。

## ADB 授权写入

程序不内置 ADB。使用后台“ADB 授权写入”前，需要在运行服务的主机安装 Android SDK Platform Tools，并确保 `adb` 命令已加入服务进程的 `PATH`。页面每 3 秒检测设备，可在多台设备中选择目标设备，并通过常见或自定义网卡名称读取 `/sys/class/net/<网卡名称>/address`。

写入时以设备 MAC 和所选 PID 调用与网络接口相同的常规分配流程，再将模板中的 `{{pid}}`、`{{did}}`、`{{license}}` 替换为实际数据，通过 `adb push` 写入设备端完整路径，随后执行 `adb shell sync`。若分配成功后推送或同步失败，授权码仍保持已分配状态，成功与失败均写入操作日志。页面还可在二次确认后重启当前选中的 ADB 设备，重启不要求密码且不记录审计日志。网卡名称、推送路径和模板只保存在当前浏览器本地。

如果指定端口已被占用或被 Windows保留，程序会从该端口开始向后查找可用端口，并在启动信息中打印所有可访问的 IP地址和最终端口。可通过以下命令查看 Windows系统保留端口：

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

例如 8080位于保留范围时，程序会自动尝试 8081、8082，直到成功监听。管理后台和设备接口会同时使用最终端口。

## 独立发行包

在目标操作系统上执行：

```bash
yarn package:standalone
```

输出位于 `release/AuthCodePlatform/`，包含独立可执行文件、Web资源和服务部署示例。不同操作系统必须分别构建。

Windows服务安装示例位于 `deploy/windows/install-service.ps1`；Linux systemd模板位于 `deploy/linux/`。

## 设备接口

```http
POST /api/device/authorize
Content-Type: application/json

{"mac":"AA-BB-CC-11-22-33","pid":"P1001"}
```

成功时返回旧版兼容字段：`pid`、规范化 `mac`、`display_code`、完整 `payload`、`assigned_at`、`source_batch`和 `mode`。

## 代码结构

```text
server/
  db/             SQLite初始化与事务
  domain/         领域格式与校验
  repositories/   数据访问
  services/       分发、库存、审计、Excel和迁移
  hardware/       串口/USB扩展契约
shared/           前后端共享类型
web/
  components/     设计系统业务组件
  layouts/        后台整体布局
  views/          各功能页面
deploy/           系统服务模板
tools/            独立可执行文件构建
tests/            API兼容与安全测试
```
