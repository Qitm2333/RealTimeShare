# Torras 极致开放麦互动系统

局域网内可用的开放麦互动系统：演讲端展示 PDF，观众手机发送弹幕、快捷用语和礼物，现场实时呈现互动反馈。

## 启动

```bash
npm install
npm start
```

默认端口是 `3000`。启动后终端会打印本机局域网访问地址。

## 页面

- 演讲端：`http://localhost:3000/`
- 观众端：`http://localhost:3000/audience`

## 演讲密码

默认密码：

```text
123456
```

可以通过环境变量修改：

```bash
PRESENTER_PASSWORD=你的密码 npm start
```

Windows PowerShell：

```powershell
$env:PRESENTER_PASSWORD="你的密码"; npm start
```

## 放置图片

将分享图片放到 `docs/` 目录，建议命名：

```text
01.jpg
02.jpg
03.jpg
```

支持 `jpg`、`jpeg`、`png`、`webp`、`gif`。

## 操作

- 演讲端输入密码后进入展示。
- 右方向键 / 空格 / PageDown：下一页。
- 左方向键 / PageUp：上一页。
- 观众端输入昵称后发送弹幕或点击互动按钮。
