# Windows 运行放行说明

当打包产物在 Windows 上运行时报错：

```text
应用程序控制策略已阻止此文件
```

这通常不是程序自身异常，而是当前机器启用了应用控制或白名单策略，例如：

- Windows Defender Application Control (WDAC)
- AppLocker
- 企业安全软件的执行白名单
- 下载文件的网络来源标记（Mark-of-the-Web）与本机策略叠加

## 现场优先排查

建议按下面顺序处理。

### 1. 先解除下载来源标记

如果压缩包是从浏览器下载的，优先对 zip 解除标记后再解压：

```powershell
Unblock-File .\AuthCodePlatform-v0.1.2-windows-x64.zip
```

如果已经解压，也可以直接对 exe 解除标记：

```powershell
Unblock-File .\AuthCodePlatform.exe
```

说明：

- 最稳的是先对 zip 执行 `Unblock-File`，再重新解压
- 如果文件来自企业 IM、网盘或邮件，也可能带有相同来源标记

### 2. 不要在 `Downloads` 目录直接运行

很多策略会对 `Downloads`、桌面、临时目录等路径做更严格限制。

建议改放到固定目录，例如：

```text
D:\Tools\AuthCodePlatform\
```

或：

```text
C:\ProgramData\AuthCodePlatform\
```

然后再运行：

```powershell
.\AuthCodePlatform.exe
```

### 3. 用管理员权限验证是否为策略拦截

如果解除标记、切换目录后仍然报同样错误，基本可以判断是本机或域策略阻止执行，而不是程序打包损坏。

## 给 IT / 产线的放行方案

如果这套程序需要长期在产线重复发版，推荐由 IT 选择下面三种方案之一。

### 方案一：按代码签名放行

这是最推荐的长期方案。

做法：

- 给 `AuthCodePlatform.exe` 做企业代码签名
- 在 WDAC / AppLocker / 安全软件中按发布者证书放行

优点：

- 后续新版本可持续复用
- 不需要每次发版都重新申请哈希白名单

### 方案二：按目录路径放行

适合产线固定部署目录。

做法：

- 约定固定安装路径，例如 `D:\Tools\AuthCodePlatform\`
- 由策略对该目录下的可执行文件放行

优点：

- 比逐文件哈希维护简单

注意：

- 需要严格控制该目录写入权限，避免路径放行带来额外风险

### 方案三：按文件哈希放行

适合临时验证或首次上线。

做法：

- 对当前版本 exe 计算哈希
- 由 IT 将该哈希加入允许名单

PowerShell 示例：

```powershell
Get-FileHash .\AuthCodePlatform.exe -Algorithm SHA256
```

优点：

- 放行范围最小

注意：

- 每次重新打包后哈希都会变
- 每个版本都需要重新申请放行

## 建议的产线流程

推荐用下面的顺序：

1. 先在测试机验证打包产物能正常运行
2. 如被拦截，先执行 `Unblock-File`
3. 再移到固定部署目录运行
4. 若仍被拦截，由 IT 选择签名放行、路径放行或哈希放行
5. 长期建议切换到“代码签名 + 发布者放行”

## 附加说明

- 如果你们使用 GitHub Release 下载产物，下载后的 zip 很可能默认带网络来源标记
- 如果程序本身能在无策略机器上运行，而在产线被拦截，优先判断为环境策略问题
- 这类拦截通常发生在程序启动前，和 Flask、Python、SQLite 本身无关
