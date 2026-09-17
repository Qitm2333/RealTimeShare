# TORRAS Live Interaction

TORRAS 现场互动工具。主持人启动桌面端后，可在 PowerPoint、Keynote、视频或其他演示内容上方显示透明互动层；观众通过局域网二维码加入现场，在手机浏览器中参与弹幕、礼物、投票和抽奖。

> 当前状态：Windows x64 版本已进入稳定测试；macOS Apple Silicon 版本通过 GitHub Actions 生成，仍需在真实 Mac 上完成窗口层级与全屏兼容性验证。

## 功能

- 透明、置顶、鼠标穿透的全屏互动覆盖层
- 顶部触发式控制栏，不遮挡正常演示
- 弹幕、快捷用语和礼物动效
- 礼物、最高礼物和现场热度统计
- 二维码入场和局域网地址切换
- PDF 课件上传、翻页与观众阅读权限
- 投票创建、保存、发起和结果展示
- 按互动权重抽奖，中奖结果手动确认关闭
- 多显示器选择、现场重置和数据隔离

## Windows 便携版

Windows 用户可直接运行生成的：

```text
release/Torras Live Interaction-1.0.0-portable-x64.exe
```

程序启动后选择演示屏幕、输入主持密码并点击“开始互动”。控制栏收起后，将鼠标移动到目标屏幕顶部即可重新显示。

### 本地构建

```powershell
npm ci
npm run check
npm run desktop:portable
```

Windows 便携包会输出到 `release/`。构建产物不会提交到 Git。

## macOS 测试版

macOS 包必须在 macOS 环境中构建。本项目使用 GitHub Actions 生成 Apple Silicon `arm64` ZIP：

1. 打开仓库的 **Releases** 页面。
2. 打开最新的 **macOS Test Build** 预发布版本。
3. 下载 `Torras Live Interaction-1.0.0-mac-arm64.zip`。
4. 同时下载 `SHA256SUMS.txt`，核对文件完整性后解压，即可得到 `Torras Live Interaction.app`。

每次手动运行 **Build macOS** workflow 后都会生成一个新的预发布版本。Actions 运行详情中的 `torras-live-interaction-macos-arm64` Artifact 仍会保留 14 天，仅作为开发备用下载。

当前 Actions 产物仅使用 ad-hoc 临时签名，未进行 Apple Developer 签名和公证，只用于内部测试。首次打开方式和验证清单见 [macOS 测试说明](docs/MACOS.md)。

在真实 Mac 上也可以直接构建：

```bash
npm ci
npm run check
CSC_IDENTITY_AUTO_DISCOVERY=false npm run desktop:mac
```

## Web 模式

项目仍可作为普通局域网 Web 服务运行：

```bash
npm ci
npm start
```

默认地址：

- 主持端：`http://localhost:3000/`
- 观众端：`http://localhost:3000/audience`

终端会同时输出可供手机访问的局域网地址。Windows 防火墙提示出现时，需要允许应用访问当前专用网络。

## 桌面端开发

```bash
npm ci
npm run desktop
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `npm start` | 启动 Web 服务 |
| `npm run desktop` | 启动 Electron 桌面端 |
| `npm run check` | 检查主要 JavaScript 文件语法 |
| `npm run desktop:portable` | 构建 Windows x64 便携版 |
| `npm run desktop:build` | 构建 Windows 安装版和便携版 |
| `npm run desktop:mac` | 在 macOS 上构建 arm64 ZIP |

## 主持密码

默认密码为：

```text
123456
```

开发环境可通过 `PRESENTER_PASSWORD` 修改：

```powershell
$env:PRESENTER_PASSWORD="your-password"
npm start
```

正式活动不建议继续使用默认密码。

## 数据与目录

```text
electron/       Electron 主进程、窗口与系统交互
public/         主持端、观众端和桌面端页面资源
config/         礼物配置
data/           当前课件与运行时现场数据
build/          启动图及构建辅助文件
.github/        GitHub Actions 构建流程
```

`data/current.pdf`、用户身份、投票状态、抽奖记录和构建产物均已从 Git 跟踪中排除。不要将真实活动数据提交到仓库。

## 平台说明

- Windows：当前主要验证平台。
- macOS：业务页面可直接复用，但透明置顶层、独立 Space、Keynote、PowerPoint、多屏幕、菜单栏和 Dock 行为需要实机验证。
- 本程序不采集或分享屏幕，只在其他软件上方创建透明互动窗口。

## 授权

仓库当前未附带开源许可证。TORRAS 品牌资源和字体仅用于本项目，未经授权请勿对外再分发。
