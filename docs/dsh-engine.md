# Asumi Agent 架构

> 分支：`feat/dsh-engine`
> 状态：引擎 / 模型 / 桌宠 / 屏幕理解 / 快捷呼出 均已实测

## 组成

Asumi Agent 由三块组成，互不越界：

| 层 | 位置 | 职责 |
|---|---|---|
| 引擎 | `@deepseek-ai/dsh`（`node_modules`） | 会话、模型、工具、UI（web client） |
| 能力 | `asumi-plugins/*`（DSH bundle） | 人设、桌面能力、工具 |
| 宿主 | `src-tauri/`（Rust） | 窗口、桌宠、桌面桥、系统集成 |

**Cherry Studio 的代码不在本分支**，只保留在 `migration-plan` 分支上供参考与迁移。

## 运行链路

```
Tauri shell (Rust)
  ├─ beforeDevCommand: node scripts/spawn-dsh.mjs
  │    ├─ :9999  占位 HTTP 服务（满足 Tauri CLI 的 devUrl 探测）
  │    ├─ spawn  pnpm dsh --profile asumi --no-open
  │    └─ 解析 stdout 的 token URL → 写入 dist/dsh-url.json
  └─ dsh::watch 轮询 dist/dsh-url.json → 导航 main / quickAssistant

DSH engine (Node, Cordis)
  └─ $DSH_HOME/profiles/asumi  =  @deepseek-ai/dsh-base
                                + @deepseek-ai/dsh-web-app
                                + asumi-plugin-persona
                                + asumi-plugin-desktop
       └─ :3080  DSH web client（token 认证，cookie 会话）
```

`$DSH_HOME` 默认 `~/Library/Application Support/AsumiAgent`（可用 `DSH_HOME` 覆盖）。

## 仓库结构

```
asumi-plugins/           DSH bundle（能力都在这里）
  asumi-persona/         人设：系统提示词 section + {{asumi_name}} 变量
  asumi-desktop/         桌面桥：asumi_speak / asumi_look / asumi_presence
scripts/
  spawn-dsh.mjs          占位服务 + 启动引擎 + 写出 dev URL
  link-dsh-packages.mjs  把宿主 DSH 包软链进 asumi-plugins/node_modules（postinstall）
  configure-asumi-model.mjs  把 Cherry 的服务商/模型迁进 DSH 用户设置
src-tauri/
  src/lib.rs             模块装配 + run()
  src/dsh.rs             引擎 URL 发现与就绪导航
  src/bridge.rs          桌面桥客户端、截图、base64
  src/pet.rs             桌宠窗口与存在模式
  src/quick.rs           ⌘E 快捷助手窗口
  src/tray.rs            菜单栏
  src/voice.rs           TTS
  pet/index.html         桌宠页面（透明，file:// 加载）
  loading/index.html     生产构建的"启动中"页（frontendDist）
docs/reference/          Cherry Studio 移植资料（代码不在本分支）
```

Tauri 壳不含任何引擎逻辑：它只负责把一个 webview 指向引擎，并做插件做不到的
系统集成。

## 首次准备

```bash
pnpm install                                              # postinstall 会链接宿主 DSH 包
pnpm dsh --profile asumi --from-default-profile web       # 创建 profile（已创建则跳过）
# 把 asumi-plugins/* 加进 profile 的 dsh.profile.bundles
pnpm dev
```

profile 目录在 `$DSH_HOME/profiles/asumi`，其 `package.json` 以 `link:` 指向本仓库的
`asumi-plugins/*`，因此改插件代码后 `patchReload: live` 会直接热加载。

## 模型接入

Cherry Studio 把自定义服务商存在 `cherrystudio.sqlite` 的 `user_provider` /
`user_model`，DSH 把同一件事放在用户设置文档里。迁移脚本读前者、写后者：

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

## 桌面桥

```
asumi_speak / asumi_look / asumi_presence   (插件工具)
        │  line-JSON, 127.0.0.1:${ASUMI_DESKTOP_PORT:-3099}
        ▼
src-tauri/src/bridge.rs  ──►  桌宠窗口 / TTS / 通知 / 截图
```

插件侧是**服务端**，Rust 侧连上来读取命令并回写结果。回复是一条可能上 MB 的长
JSON 行，因此插件按 socket 做**行缓冲**（不能假设一次 `data` 事件就是一行）。
没有客户端连接时桥进入 detached 模式，工具会如实告诉模型"桌面未连接"，而不是阻塞。

`asumi_look` 的截图链路：

```
capture-screen → Rust /usr/sbin/screencapture -x -t png <tmp>
              → base64（手写，避免为一个用途引入依赖）
              → 插件 ctx.attachments.admitPromptContent() 归一化落盘
              → ImageBlock → 模型
```

pi-ai 适配器会把 tool-result 里的图片投影成 `image` content part，前提是模型声明了
`input: [text, image]`。macOS 需要**屏幕录制权限**；没有权限时 `screencapture` 仍
返回 0 但只拿到桌面背景，Rust 以 `ok:false` 回写，让あすみ告诉先輩而不是描述一张
空画面。

## 桌宠与存在模式

桌宠窗口 `pet`：透明、置顶、跳过任务栏、点击穿透，默认停在主屏右下角。
存在模式由桥命令 `pet-mode` 驱动，也是 `asumi_presence` 工具的实现：

| 模式 | 行为 |
|---|---|
| `always`（常驻） | 一直显示 |
| `ghost`（透明） | 窗口保留但全透明，只在开口时淡入、约 9s 后淡出 |
| `hidden` | 窗口直接 hide |

淡入淡出由页面 CSS（`body[data-mode]` + `.ghost-active`）完成，Rust 只负责可见性与
模式状态。菜单栏（`tray.rs`）也能切这三种模式。

TTS 按文本书写系统选语音（假名→ja/`Kyoko`，汉字→zh/`Tingting`，其余→en/`Samantha`），
可用 `ASUMI_TTS_VOICE{,_JA,_ZH,_EN}` 覆盖；语音不在本机时回退到系统默认。

## 快捷呼出

`⌘E` 在 `quick.rs` 里全局注册（不再经过任何后端服务）：首次呼出时创建一个指向引擎
的 webview（共用 main 的会话 cookie），失焦即隐藏，再按一次也隐藏。

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

## 验证

| 项 | 结果 |
|---|---|
| `pnpm dev` | ✅ 引擎 + 壳联动，webview 自动导航 |
| 引擎就绪 | ✅ `:3080` 监听，无 `did not activate` |
| 模型路由 | ✅ `llm/listProviders` 返回 `qwen3-8`，默认模型显示 `Qwen3.8-27B-Uncensored-FP8` |
| 工具链路 | ✅ `asumi_presence` → `pet mode -> ghost`；`asumi_speak` → `tts speaking (voice Kyoko)` |
| 屏幕理解 | ✅ `asumi_look` → `capture-screen 3420x2224` → 模型正确描述当前屏幕 |

## 已知事项

- DSH 为 developer preview（`0.1.5-rc.1`），升级需重新跑一遍验证表。
- 生产打包尚未接：`tauri build` 用 `loading/index.html` 作 `frontendDist`，但还没有
  随包启动引擎的机制（当前只有 dev 链路）。
- 音频播放（`playAudio` / 桥命令 `audio`）按计划跳过，桥里仍是占位日志。
- 非 macOS 平台：`screencapture` 与 `say` 未实现，截图会回 `ok:false`、TTS 退化为日志。
