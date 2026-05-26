AuthCodePlatform Windows 运行说明
================================

如果双击或执行 AuthCodePlatform.exe 时看到类似提示：

  应用程序控制策略已阻止此文件

这通常不是程序损坏，而是当前 Windows 机器启用了应用控制或白名单策略。

建议按下面顺序处理：

1. 如果压缩包是从浏览器下载的，先解除下载标记，再重新解压

   PowerShell:
   Unblock-File .\AuthCodePlatform-vX.Y.Z-windows-x64.zip

2. 不要直接在 Downloads 目录运行

   建议把整个目录移动到例如：
   D:\Tools\AuthCodePlatform\
   或
   C:\ProgramData\AuthCodePlatform\

3. 如果已经解压，也可以直接对 exe 解除标记

   PowerShell:
   Unblock-File .\AuthCodePlatform.exe

4. 如果仍然被拦截，请联系 IT 或产线管理员做放行

   常见放行方式：
   - 按代码签名放行（长期最推荐）
   - 按固定部署目录放行
   - 按当前 exe 的 SHA256 哈希放行

计算当前 exe 哈希：

   PowerShell:
   Get-FileHash .\AuthCodePlatform.exe -Algorithm SHA256

附加说明：

- 如果程序能在无策略机器上正常运行，而在产线机器上被拦截，优先判断为环境策略问题
- 这种拦截通常发生在程序启动前，与 Python / Flask / SQLite 本身无关
- 详细说明可联系交付方索取《Windows 运行放行说明》
