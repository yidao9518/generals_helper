# Generals Helper (MVP)

这是一个最小可运行的 Chrome MV3 插件，用于读取 `generals.io` 的 WebSocket 数据帧。

## 当前能力

- 自动注入页面脚本，监听 `WebSocket` 的 `send` 和 `message`
- 采集入站/出站帧的方向、时间、大小、预览内容
- 自动识别 Socket.IO 文本帧类型（如 `event`）并提取事件名（如 `pre_game_start`）
- 基于 `game_start` ~ `game_lost/game_won` 标记对局区间，支持仅查看最近一局/进行中数据
- 将最近 500 条数据保存在 `chrome.storage.local`
- 在插件弹窗中查看最近数据，并支持清空
- 解析 Socket.IO 战场数组的宽高、每格兵力和状态，并保留原始数组数据

## 项目结构

- `manifest.json`: 插件配置
- `src/content/content.js`: 注入桥接脚本，转发消息
- `src/injected/ws-hook.js`: 在页面上下文 Hook `WebSocket`
- `src/background/service-worker.js`: 存储和查询数据
- `src/popup/*`: 简单查看器
- `src/shared/helper-config.js`: 共享常量与默认显示配置
- `src/shared/frame-tools.js`: 可测试的公共工具函数
- `tests/frame-tools.test.js`: 本地快速测试

## 本地验证

```powershell
Set-Location "D:\code\generals_helper"
npm test
```

## 安装插件

1. 打开 Chrome，进入 `chrome://extensions/`
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择目录 `D:\code\generals_helper`

## 使用

1. 打开 `https://generals.io/` 并进入任意对局
2. 点击扩展图标，打开弹窗
3. 点击「刷新」查看最近抓到的帧

## 下一步建议

1. 对文本帧尝试 `JSON.parse` 自动分类消息类型
2. 对二进制帧增加长度分布和重复模式分析
3. 支持导出 `.jsonl`，方便离线分析协议

