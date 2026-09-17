# DSH 引擎接入（Phase 1）

> 分支：`feat/dsh-engine`
> 状态：异步验证通过（Tauri 壳 → DSH web client 全链路可用）

## 架构

```
Tauri shell (Rust)
  ├─ beforeDevCommand: node scripts/spawn-dsh.mjs
  │    ├─ :9999  占位 HTTP 服务（满足 Tauri CLI 的 devUrl 探测）
  │    ├─ spawn  pnpm dsh --profile asumi --no-open
  │    └─ 解析 stdout 的 token URL → 写入 dist/dsh-url.json
  └─ setup 线程: 轮询 dist/dsh-url.json → eval("location.href = <token url>")

DSH engine (Node, Cordis)
  └─ $DSH_HOME/profiles/asumi  =  @deepseek-ai/dsh-base
                                + @deepseek-ai/dsh-web-app
                                + (自定义 bundle)
       └─ :3080  DSH web client（token 认证，cookie 会话）
```

`$DSH_HOME` 默认复用 Cherry 的 dev userData 目录：
`~/Library/Application Support/CherryStudio-TauriDev`

## 首次准备

```bash
# 1. 安装依赖（含 @deepseek-ai/dsh 与 sharp 修复 postinstall）
pnpm install

# 2. 创建 asumi profile（从 web 模板派生）
DSH_HOME="$HOME/Library/Application Support/CherryStudio-TauriDev" \
  pnpm dsh --profile asumi --from-default-profile web

# 3. 启动
pnpm dev
```

## 关键文件

| 文件 | 作用 |
|---|---|
| `scripts/spawn-dsh.mjs` | 占位服务 + 启动 DSH + 写出 `dist/dsh-url.json`（启动时先清掉旧文件） |
| `scripts/fix-sharp-binary.mjs` | 修复 sharp@0.35.4 的 darwin-arm64 原生二进制（postinstall） |
| `scripts/configure-asumi-model.mjs` | 把 Cherry 的服务商/模型迁移进 DSH 用户设置（见下） |
| `vendor/sharp/sharp-darwin-arm64-0.35.4.tgz` | 修复用的预编译二进制（107K，vendored） |
| `src-tauri/src/lib.rs` | `setup` 中轮询 DSH URL 并导航 webview；桌宠窗口；desktop 桥客户端 |
| `src-tauri/pet/index.html` | 桌宠页面（`__asumiSetState` / `__asumiSay` / `__asumiSetMode`） |
| `src-tauri/tauri.conf.json` | `devUrl: http://127.0.0.1:9999/`、`beforeDevCommand: spawn-dsh.mjs` |
| `src-tauri/capabilities/default.json` | 仅 `main` 窗口 + 基础权限 |
| `asumi-plugins/asumi-persona/` | 人设 bundle（`錦 あすみ` 系统提示词） |
| `asumi-plugins/asumi-desktop/` | 桌面桥 bundle（`asumi_speak` / `asumi_look` / `asumi_presence`） |

## 模型接入

Cherry Studio 把自定义服务商存在 `cherrystudio.sqlite` 的 `user_provider` /
`user_model`，DSH 则把同一件事放在用户设置文档里。迁移脚本读前者、写后者：

```bash
node scripts/configure-asumi-model.mjs --modalities text,image
```

| 写入位置 | 内容 |
|---|---|
| `$DSH_HOME/settings.yaml` | `llm-pi-ai.providers.<route>`（`api`/`baseURL`/`models`）+ `agent-default-model` |
| `$DSH_HOME/.credentials.yaml` | `refs.ASUMI_MODEL_API_KEY`（权限 600） |

- 路由名默认由服务商名派生（`Qwen3.8` → `qwen3-8`），可用 `--route` 覆盖。
- 默认挑选「用户自建服务商」下的启用模型（`preset_provider_id IS NULL`），
  可用 `--provider` / `--model` 指定。
- 端点类型 → pi-ai 协议：`openai-chat-completions` → `openai-completions`，
  另有 `openai-responses` / `anthropic-messages`。
- 密钥不写进仓库：设置文档只放 `apiKeyEnv` 引用，值走凭据文件（或 `$DSH_HOME/.env`）。
- 设置文档热重载，改完下一轮请求就生效；`--dump-config` 只打印组合树，
  **不含**用户设置层，验证要走一次真实请求。

本机当前：`http://os-cw-pc:9001/v1`（sglang）+ `Qwen3.8-27B-Uncensored-FP8`。
注意该端点的模型 id 用的是 U+2011 连字符，两种写法服务端都接受。

## 屏幕理解

```
asumi_look 工具 (插件)  --capture-screen-->  桥  -->  Rust
                                                      └─ /usr/sbin/screencapture -x -t png
       模型 <- image block <- attachments.admitPromptContent() <- base64 PNG
```

- 桥是**双向**的：插件侧是服务端，Rust 侧连上来读取命令并回写结果。
  回复是一条可能上 MB 的长 JSON 行，因此插件按 socket 做**行缓冲**（不能假设一次
  `data` 事件就是一行）。
- Rust 用 `TcpStream::try_clone` 保留写半端，`capture-screen` 结果以
  `{type:'capture-screen-result', requestId, ok, mediaType, data, …}` 回写。
- 截图先经 `ctx.attachments.admitPromptContent()` 归一化落盘，再以
  `ImageBlock` 交给模型；pi-ai 适配器会把 tool-result 里的图片投影成
  `image` content part（需要模型声明 `input: [text, image]`，见上）。
- macOS 需要**屏幕录制权限**；没有权限时 `screencapture` 仍返回 0 但只拿到桌面背景。
  失败时回写 `ok:false`，让あすみ告诉先輩而不是描述一张空画面。

## 桌宠与存在模式

桌宠窗口 `pet`：透明、置顶、跳过任务栏、点击穿透，默认停在主屏右下角。
存在模式由桥命令 `pet-mode` 驱动，也是 `asumi_presence` 工具的实现：

| 模式 | 行为 |
|---|---|
| `always`（常驻） | 一直显示 |
| `ghost`（透明） | 窗口保留但全透明，只在开口时淡入、约 9s 后淡出 |
| `hidden` | 窗口直接 hide |

淡入淡出由页面 CSS（`body[data-mode]` + `.ghost-active`）完成，Rust 只负责
可见性与模式状态。TTS 按文本书写系统选语音（假名→ja/`Kyoko`，汉字→zh/`Tingting`，
其余→en/`Samantha`），可用 `ASUMI_TTS_VOICE{,_JA,_ZH,_EN}` 覆盖。

## 快捷呼出

⌘E 呼出的 `quickAssistant` 窗口不再加载 Cherry 渲染层，而是指向 DSH web client
（同一个 webview 会话 Cookie，自动带上 token）。`window.create` 里读
`dist/dsh-url.json` 拿地址；若窗口先于引擎就绪创建，DSH watcher 会在拿到 URL 后
把 `main` 和 `quickAssistant` 一起导航过去。

## 首次使用：工作区

DSH 的空会话要求先选一个工作区（「添加工作区」走原生目录选择器）。选择结果写在
`$DSH_HOME/storages/workspace.json`：

```json
{
  "global": { "initialized": true, "workspaceIds": ["<uuid>"] },
  "tables": { "workspaces": { "<uuid>": {
    "path": "/abs/path", "title": "name",
    "sessionIds": [], "createdAt": "…", "updatedAt": "…" } } }
}
```

界面上选一次即可；手写该文件也能在不启动界面时预置工作区。

## sharp 问题的来龙去脉

- 工作区（Cherry 遗留）把 `@img/sharp-darwin-arm64` 锁定在 `0.34.5`。
- DSH 的 `@deepseek-ai/dsh-attachment-local` 依赖 `sharp@0.35.4`，其原生绑定需要
  `@img/sharp-darwin-arm64@0.35.4` + `@img/sharp-libvips-darwin-arm64@1.3.3`。
- pnpm 在 override 下把 0.34.5 的二进制链接给了 sharp 0.35.4 →
  导入时报 `Cannot read properties of undefined (reading 'output')`，
  进而 `attachment-local` 加载失败 → `session-controller`（提供 `sessions`）pending →
  web client 报 **21 entries did not activate**。
- `scripts/fix-sharp-binary.mjs` 在 `postinstall` 阶段补齐 0.35.4 二进制并建立
  libvips 同级链接，无需改动 pnpm 解析（避免全量重新下载）。

## 验证

| 项 | 结果 |
|---|---|
| `dsh --profile asumi --dump-config` | ✅ 完整插件树，无 pending |
| `dsh --profile asumi --no-open` | ✅ :3080 监听，无 `did not activate` |
| web client 首页 | ✅ 27KB HTML，`<title>DeepSeek Harness</title>` |
| token 认证 | ✅ `/?token=` → 303 + `dsh-auth-*` cookie |
| `pnpm dev` | ✅ Tauri 壳 + DSH 引擎联动，webview 自动导航 |
| 模型路由 | ✅ `llm/listProviders` 返回 `qwen3-8`；headless 一轮问答走通 |
| 屏幕理解 | ✅ `asumi_look` → `capture-screen 3420x2224` → 模型正确描述当前屏幕 |
| 存在模式 | ✅ `pet-mode` → `ghost` / `always` 生效 |

## 已知事项

- DSH 为 developer preview（当前 `0.1.5-rc.1`），升级需重新验证 profile 兼容性。
- Cherry 后端（`spawn_backend_loop`）目前仍并行启动，属过渡状态；后续可移除。
  `quickAssistant` 窗口仍由 Cherry 后端创建并沿用它的 pin / blur 自隐策略，
  只是内容换成了 DSH。
- `attachment-local` 依赖 sharp，因此 sharp 修复是 web client 可用的前提。
- 音频播放（`playAudio`）按计划跳过，桥里仍是占位日志。
