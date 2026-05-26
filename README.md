# 授权码分发平台

一个面向 Windows / Linux / macOS 局域网环境的授权码分发平台，适合产线或测试环境部署。

## 功能

- 设备通过 HTTP 接口传入 `mac` 和 `pid`，平台按 `pid` 分配授权记录。
- 同一 `mac + pid` 重复请求时返回同一条授权码，避免重复消耗库存。
- 支持 Excel 导入结构化授权数据（如 `did`、`license` 等），支持导出已分配数据与请求日志。
- 提供 Web 管理后台，可查看库存、最近分发日志和已分配明细。
- 请求日志支持按动作筛选、`pid / mac` 关键词筛选、实时刷新，以及按当前筛选条件与时间范围导出 Excel。
- 可选开启设备请求 IP 白名单，只有在名单内的来源 IP 才允许领取授权数据。
- 白名单可在后台“访问控制”页面直接维护，配置持久化到 SQLite，不依赖外部配置文件保存运行时修改。
- 使用 SQLite 本地存储，部署简单，无需额外数据库。

## 目录结构

```text
app/
  api/            # 接口和后台路由
  repositories/   # 数据访问层
  services/       # 业务层、Excel 处理
  templates/      # Jinja2 页面模板
  static/         # 后台静态资源
scripts/          # 启动与打包脚本
tests/            # 基础测试
config.json       # 运行配置
main.py           # Waitress 服务入口
```

脚本建议直接按系统使用：

- Windows：`scripts/run_dev_win.ps1`、`scripts/package_win.ps1`
- Linux：`scripts/run_dev_linux.sh`、`scripts/package_linux.sh`
- macOS：`scripts/run_dev_mac.sh`、`scripts/package_mac.sh`
- 兼容入口：`scripts/run_dev.ps1`、`scripts/run_dev.sh`、`scripts/package.ps1`、`scripts/package.sh`

## 本地运行

### 1. 创建并使用 venv

Windows:

```powershell
python -m venv .venv
python -m pip --python .\.venv\Scripts\python.exe install -r requirements.txt
```

Linux:

```bash
python3 -m venv .venv
python -m pip --python ./.venv/bin/python install -r requirements.txt
```

macOS:

```bash
uv venv .venv
uv pip install --python ./.venv/bin/python -r requirements.txt
```

### 2. 修改配置

编辑 `config.json`：

- `host`: 局域网访问建议保留 `0.0.0.0`
- `port`: 默认 `8080`
- `admin_username` / `admin_password`: 后台登录账号
- `data_dir`: SQLite 数据和导出文件目录
- `request_ip_whitelist.enabled`: 设备请求 IP 白名单的首次启动默认值
- `request_ip_whitelist.allowed_ips`: 白名单的首次启动默认值，支持 IP 或 CIDR 网段列表

生产环境可通过环境变量覆盖同名配置项，例如 `AUTH_PLATFORM_PORT=9000`。
白名单也可通过环境变量覆盖，例如 `AUTH_PLATFORM_REQUEST_IP_WHITELIST_ENABLED=true`、`AUTH_PLATFORM_REQUEST_IP_WHITELIST=192.168.1.10,192.168.1.0/24`。这些值主要用于首次启动初始化；后台保存后的白名单会持久化到 SQLite 数据库中的运行时配置表。

### 3. 启动服务

Windows:

```powershell
.\scripts\run_dev_win.ps1
```

Linux:

```bash
chmod +x ./scripts/run_dev_linux.sh
./scripts/run_dev_linux.sh
```

macOS:

```bash
chmod +x ./scripts/run_dev_mac.sh
./scripts/run_dev_mac.sh
```

说明：

- macOS 下 `run_dev_mac.sh` 会优先使用 `uv` 管理 `.venv`；如果 `.venv` 不存在，会自动创建并安装依赖。
- Linux 下仍沿用现有 `.venv` 方式，脚本不会主动改动环境。
- 如果你仍在使用旧入口 `scripts/run_dev.sh` / `scripts/run_dev.ps1`，它们现在会转发到对应系统脚本。

启动后访问：

- 后台地址: `http://<服务器IP>:8080/login`
- 健康检查: `http://<服务器IP>:8080/healthz`
- 设备接口: `POST http://<服务器IP>:8080/api/device/authorize`

如果开启了请求 IP 白名单：

- 只有当前白名单中的 IP 或网段可以成功领取授权码
- 不在白名单内的请求会直接返回 `403`

后台管理补充说明：

- “访问控制”页面可以直接开启、关闭和编辑白名单
- 白名单保存后立即生效，无需重启服务
- 白名单数据存储在 SQLite 的运行时配置表中

请求示例：

```json
{
  "mac": "AA-BB-CC-11-22-33",
  "pid": "P1001"
}
```

返回示例：

```json
{
  "success": true,
  "message": "授权码分配成功",
  "data": {
    "pid": "P1001",
    "mac": "AA:BB:CC:11:22:33",
    "display_code": "DID-001",
    "payload": {
      "did": "DID-001",
      "license": "LICENSE-001"
    },
    "assigned_at": "2026-05-17 10:00:00",
    "source_batch": "BATCH-01",
    "mode": "assigned"
  }
}
```

## Excel 导入说明

- 默认读取首个工作表。
- 推荐表头：`pid`、`did`、`license`、`source_batch`
- `did` 和 `license` 为必填字段，缺少任意一个都会直接报错。
- 除 `pid` 和 `source_batch` 之外，其它列都会作为结构化 JSON 载荷保存。
- 后台默认使用 `did` 作为显示标识，避免长 `license` 直接挤占表格空间。
- 如果文件里没有 `pid` 列，可在后台导入时填写“默认 PID”。
- 导入时会按 `pid + did` 维度查重：同一文件内重复或库存中已存在的相同 `pid + did` 会被跳过，并在后台给出告警。
- 不同 `pid` 下允许出现相同的 `did`。
- 在真正写入数据库之前，系统会先全量校验整份文件；只要存在任意不合法记录，本次导入将整体拒绝，不会部分写入。

## 打包交付

本项目使用 PyInstaller 打包，产线机器无需单独安装 Python。

Windows:

```powershell
.\scripts\package_win.ps1
```

Linux:

```bash
chmod +x ./scripts/package_linux.sh
./scripts/package_linux.sh
```

macOS:

```bash
chmod +x ./scripts/package_mac.sh
./scripts/package_mac.sh
```

产物目录：

```text
dist/AuthCodePlatform/
```

说明：

- Windows、Linux、macOS 需要分别在对应系统上执行打包。
- macOS 下 `package_mac.sh` 会优先使用 `uv` 管理 `.venv`；如果缺少 `pyinstaller`，脚本会自动安装依赖。
- `config.json`、`data/` 可和打包产物放在同级目录，便于现场修改配置和持久化数据。
- 如果现场启用了 Windows App Control、Defender Application Control 或其它白名单策略，未签名的 `AuthCodePlatform.exe` 可能需要预先放行或做代码签名。
- 如果你仍在使用旧入口 `scripts/package.sh` / `scripts/package.ps1`，它们现在会转发到对应系统脚本。

## 测试

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```
