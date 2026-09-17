# macOS 构建与测试

## 当前范围

GitHub Actions 生成 Apple Silicon `arm64` ZIP，适用于 M1 及后续 Apple 芯片 Mac。应用使用 ad-hoc 临时签名，但未进行 Apple Developer 签名和公证；该产物用于验证功能，不是可公开分发的正式安装包。

最低目标系统版本为 macOS 12。

## 获取测试包

1. 进入 GitHub 仓库的 **Releases** 页面。
2. 打开最新的 **macOS Test Build** 预发布版本。
3. 下载 `Torras Live Interaction-1.0.0-mac-arm64.zip` 和 `SHA256SUMS.txt`。
4. 核对 SHA-256 后解压 ZIP，得到 `Torras Live Interaction.app` 和 `首次打开 Torras.command`。

需要生成新测试包时，进入 **Actions** 页面，打开 **Build macOS**，点击 **Run workflow** 并选择 `master` 分支。构建成功后会自动创建新的预发布版本；运行详情中的 `torras-live-interaction-macos-arm64` Artifact 仍保留 14 天，供开发排查时备用。

## 首次打开

因为测试包尚未进行 Apple Developer 签名和公证，macOS 可能阻止直接双击运行。优先使用下面的方式：

1. 保持 `首次打开 Torras.command` 与 App 位于同一目录。
2. 在 Finder 中右键辅助脚本，选择“打开”。
3. 脚本会移除旁边 App 的下载隔离标记并自动启动 App。

辅助脚本不使用 `sudo`，不会修改系统安全设置，只处理同目录下名称完全匹配的 `Torras Live Interaction.app`。以后可以直接打开 App，不需要重复运行脚本。

如果仍被隔离策略阻止，内部测试人员可以在终端执行：

```bash
xattr -dr com.apple.quarantine "/Applications/Torras Live Interaction.app"
```

只对从本仓库 Actions 下载并核对过 SHA-256 的测试包执行该命令。

## 必测场景

- 普通桌面窗口上的透明覆盖和鼠标穿透
- Keynote 播放及其独立全屏 Space
- PowerPoint 播放及其演讲者视图
- 浏览器和本地视频全屏
- 单屏与双屏切换
- 菜单栏自动隐藏、刘海屏安全区域
- Dock 位于底部、左侧、右侧及自动隐藏
- 顶部触发控制栏及自动收起
- 二维码展开、编辑和扫码入场
- PDF 上传、翻页和观众阅读权限
- 弹幕、礼物、投票、抽奖及中奖卡片关闭
- 其他 App 获得焦点后，互动层仍保持置顶

## 已知限制

- 尚未配置 Apple Developer 签名和公证。
- macOS 全屏 Space 的层级行为与 Windows 不同，需要根据实机结果调整。
- 首次监听局域网端口时，可能出现系统防火墙或本地网络权限提示。
- DRM 视频、系统安全界面等受保护内容不保证允许第三方窗口覆盖。

## 正式发布前

正式对外分发需要：

- Apple Developer ID Application 证书
- Hardened Runtime 和合适的 entitlements
- Apple Notarization 公证
- `.icns` 应用图标
- 在 Intel Mac 上验证或额外生成 x64 版本
- 根据需要生成 DMG，而不是仅提供 ZIP
