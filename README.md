# 授权码分发平台

一个面向 Windows / Linux 局域网环境的授权码分发平台，适合产线或测试环境部署。

## 功能

- 设备通过 HTTP 接口传入 `mac` 和 `pid`，平台按 `pid` 分配授权记录。
- 同一 `mac + pid` 重复请求时返回同一条授权码，避免重复消耗库存。
- 支持 Excel 导入结构化授权数据（如 `did`、`license` 等），支持导出已分配数据。
- 提供 Web 管理后台，可查看库存、最近分发日志和已分配明细。
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

### 2. 修改配置

编辑 `config.json`：

- `host`: 局域网访问建议保留 `0.0.0.0`
- `port`: 默认 `8080`
- `admin_username` / `admin_password`: 后台登录账号
- `data_dir`: SQLite 数据和导出文件目录

生产环境可通过环境变量覆盖同名配置项，例如 `AUTH_PLATFORM_PORT=9000`。

### 3. 启动服务

Windows:

```powershell
.\scripts\run_dev.ps1
```

Linux:

```bash
chmod +x ./scripts/run_dev.sh
./scripts/run_dev.sh
```

启动后访问：

- 后台地址: `http://<服务器IP>:8080/login`
- 健康检查: `http://<服务器IP>:8080/healthz`
- 设备接口: `POST http://<服务器IP>:8080/api/device/authorize`

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
    "display_code": "LICENSE-001",
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
- 除 `pid` 和 `source_batch` 之外，其它列都会作为结构化 JSON 载荷保存。
- 后台会自动从 `auth_code / license / did / code` 中挑一个值作为显示标识。
- 如果文件里没有 `pid` 列，可在后台导入时填写“默认 PID”。
- 重复的相同结构化载荷会被自动跳过，不会重复入库。

## 打包交付

本项目使用 PyInstaller 打包，产线机器无需单独安装 Python。

Windows:

```powershell
.\scripts\package.ps1
```

Linux:

```bash
chmod +x ./scripts/package.sh
./scripts/package.sh
```

产物目录：

```text
build-output/dist/AuthCodePlatform/
```

说明：

- Windows 和 Linux 需要分别在对应系统上执行打包。
- `config.json`、`data/` 可和打包产物放在同级目录，便于现场修改配置和持久化数据。
- 如果现场启用了 Windows App Control、Defender Application Control 或其它白名单策略，未签名的 `AuthCodePlatform.exe` 可能需要预先放行或做代码签名。

## 测试

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```
