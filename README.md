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

## 本地 Python 分析桥

浏览器扩展负责采集、还原和展示；Python 默认提供本地 HTTPS 分析接口，也支持临时切回 HTTP。

- `python_bridge/README.md`: Python 服务最小启动说明
- `python_bridge/PROTOCOL.md`: 浏览器和 Python 的接口协议
- `python_bridge/server.py`: 本地 HTTPS 服务（HTTP 可回退）

启动示例（默认 HTTPS）：

```powershell
Set-Location "D:\code\generals_helper"
python -m python_bridge.server --host 127.0.0.1 --port 8765 --certfile .\certs\localhost.crt --keyfile .\certs\localhost.key
```

HTTP 回退示例（仅在你明确需要时使用）：

```powershell
Set-Location "D:\code\generals_helper"
python -m python_bridge.server --host 127.0.0.1 --port 8765
```

Windows 一键启动 HTTPS（推荐）：

```powershell
Set-Location "D:\code\generals_helper"
.\start_https_bridge.ps1
```

这个脚本会优先复用已有的 `certs\localhost.crt` / `certs\localhost.key`，只有在证书文件缺失时才重新生成，因此适合长期固定使用同一套本地证书。
如果该证书已经在 Windows 当前用户根证书库里被信任，脚本也会自动识别并跳过重复导入。

如果第一次运行提示缺少 `cryptography`，可以直接带上 `-InstallDeps`：

```powershell
Set-Location "D:\code\generals_helper"
.\start_https_bridge.ps1 -InstallDeps
```

或者手动先安装桥接包依赖：

```powershell
Set-Location "D:\code\generals_helper"
python -m pip install -e .\python_bridge
```

如果你不想自动信任证书，可以改用：

```powershell
Set-Location "D:\code\generals_helper"
.\start_https_bridge.ps1 -SkipTrust
```

`start_https_bridge.ps1` 会把生成的 `localhost.crt` 安装到 Windows 当前用户的受信任根证书中，从而避免浏览器报 `ERR_CERT_AUTHORITY_INVALID`。

> 本地 HTTPS 一般需要证书已被系统/浏览器信任，尤其是 `localhost` / `127.0.0.1`。

默认接口：

- `GET /healthz`
- `POST /v1/ingest`
- `GET /v1/latest`
- `GET /v1/analysis/latest`
- `GET /v1/history?limit=25`

## 项目结构

- `manifest.json`: 插件配置
- `src/content/content.js`: 注入桥接脚本，转发消息
- `src/injected/ws-hook.js`: 在页面上下文 Hook `WebSocket`
- `src/background/service-worker.js`: 存储和查询数据
- `src/background/python-bridge-controller.js`: 本地 Python 桥接控制器
- `src/display/*`: 信息显示，维护合并战场视图
- `src/display/assets/`: 信息显示页专用图片/纹理资源（如 `patterns/`）
- `src/options/*`: 独立设置页
- `src/popup/*`: 旧版快捷控制入口（保留兼容）
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
2. 点击扩展图标，打开原始 popup
3. 在 popup 里点击「打开信息显示」查看合并战场（会在当前浏览器中打开新标签页，可直接拖拽/停靠回原浏览器窗口）
4. 如果你想把 `-2`、`-4` 的图案做成图片，建议放在 `src/display/assets/patterns/`，例如 `minus2.svg`、`minus4.svg`
5. 如果需要更完整的设置，点击「打开设置页」进入独立设置页

## 下一步建议

1. 对文本帧尝试 `JSON.parse` 自动分类消息类型
2. 对二进制帧增加长度分布和重复模式分析
3. 支持导出 `.jsonl`，方便离线分析协议
4. 把扩展里的战场快照直接 POST 到本地 Python 接口

