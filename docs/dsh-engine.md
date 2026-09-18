# Asumi Agent 架构

> 分支：`feat/dsh-engine`
> 状态：引擎 / 模型 / 桌宠 / 屏幕理解 / 快捷呼出 / 打包 均已实测

## 组成

Asumi Agent 由三块组成，互不越界：

| 层 | 位置 | 职责 |
|---|---|---|
| 引擎 | `@deepseek-ai/dsh` | 会话、模型、工具、UI（web client） |
| 能力 | `asumi-plugins/*`（DSH bundle） | 人设、桌面能力、工具 |
| 宿主 | `src-tauri/`（Rust） | 启动引擎、窗口、桌宠、桌面桥、系统集成 |

**Cherry Studio 的代码不在本分支**，只保留在 `migration-plan` 分支上供参考与迁移。

## 运行链路

```
Tauri shell (Rust)
  ├─ engine::spawn        启动引擎（见下），解析 stdout 的 token URL
  ├─ dsh::publish         拿到 URL → 导航 main / quickAssistant
  └─ bridge::spawn_client 连接插件开的桌面桥

DSH engine (Node, Cordis)
  └─ $DSH_HOME/profiles/asumi  =  @deepseek-ai/dsh-base
                                + @deepseek-ai/dsh-web-app
                                + asumi-plugin-persona
                                + asumi-plugin-desktop
       └─ :<随机端口>  DSH web client（token 认证，cookie 会话）
```

引擎由壳自己启动，因此**没有占位 HTTP 服务、没有 `devUrl`、没有 URL 文件**：
开发与打包走同一条代码路径。窗口先显示 `src-tauri/loading/index.html`，
引擎就绪后导航过去。

端口都不固定：

- 引擎用 `--port 0`，由系统分配 web client 端口（URL 里带回来）。
- 桌面桥端口由壳分配（`bind :0` 拿一个空闲端口），通过 `ASUMI_DESKTOP_PORT`
  传给插件，两端必然一致。

这样即使上一次运行残留了引擎，也不会阻塞或误连。

## 引擎位置

| 场景 | 引擎 | Node |
|---|---|---|
| 开发 | 仓库 `node_modules/` | `PATH` 上的 `node` |
| 打包 | `Contents/Resources/engine/` | `Contents/MacOS/node`（sidecar） |

可用 `ASUMI_ENGINE_DIR` / `ASUMI_NODE` 覆盖，排障时很有用。

## 仓库结构

```
asumi-plugins/           DSH bundle（能力都在这里）
  asumi-persona/         人设：系统提示词 section + {{asumi_name}} 变量
  asumi-desktop/         桌面桥：asumi_speak / asumi_look / asumi_presence
scripts/
  build-engine.mjs       组装打包用的引擎树（src-tauri/engine）
  fetch-node.mjs         取 Node 运行时当 sidecar（src-tauri/binaries）
  link-dsh-packages.mjs  把宿主 DSH 包软链进 asumi-plugins/node_modules（postinstall）
  configure-asumi-model.mjs  把 Cherry 的服务商/模型迁进 DSH 用户设置
src-tauri/
  src/lib.rs             模块装配 + run()
  src/engine.rs          启动 / 预置 profile / 关停引擎
  src/dsh.rs             引擎 URL 持有与 webview 导航
  src/bridge.rs          桌面桥客户端、截图、base64、端口分配
  src/pet.rs             桌宠窗口与存在模式
  src/quick.rs           ⌘E 快捷助手窗口
  src/tray.rs            菜单栏
  src/voice.rs           TTS
  pet/index.html         桌宠页面（透明，file:// 加载）
  loading/index.html     启动页（frontendDist）
  tauri.bundle.conf.json 打包用配置叠加层（见下）
docs/reference/          Cherry Studio 移植资料（代码不在本分支）
```

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
        │  line-JSON, 127.0.0.1:<壳分配的端口>
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

`⌘E` 在 `quick.rs` 里全局注册：首次呼出时创建一个指向引擎的 webview（共用 main 的
会话 cookie），失焦即隐藏，再按一次也隐藏。

## 打包

```bash
pnpm build     # = tauri build --config src-tauri/tauri.bundle.conf.json
```

产物是一个完全自带的 `.app`（当前约 400MB）：

| 内容 | 大小 | 来源 |
|---|---|---|
| 引擎树 | ~276MB | `scripts/build-engine.mjs` → `src-tauri/engine/` |
| Node 运行时 | ~117MB | `scripts/fetch-node.mjs` → `src-tauri/binaries/node-<triple>` |
| 壳 | ~9MB | cargo release |

两件东西通过 `src-tauri/tauri.bundle.conf.json`（一个 `--config` 叠加层）声明：

```json
{ "bundle": { "resources": ["engine"], "externalBin": ["binaries/node"] } }
```

**为什么放在叠加层而不是主配置**：Tauri 会对 `resources` / `externalBin` 的路径做
构建期校验，且**开发构建也会校验**，放主配置会让 `pnpm dev` 也必须先下载 Node。
叠加层把这份要求限定在打包路径上。

引擎树的组装要点（`build-engine.mjs`）：

- **用 `nodeLinker: hoisted`**：打包会把 resource 拷进 `.app` 并签名，pnpm 默认的
  软链农场两者都过不去。hoisted 得到一棵扁平、全是真实文件的树。
- **运行时不依赖 pnpm**：DSH 从 profile 自己的 `node_modules` 解析插件，所以
  `asumi-plugins/*` 直接拷进 `engine/profiles/asumi/node_modules/`。
  `pnpm` 只有 `dsh plugin` 用得到，而 app 从不调用它。
- 首次启动时把 `engine/profiles/asumi` 拷到 `$DSH_HOME/profiles/asumi`（不存在时）。
  想重新预置就删掉它再启动。
- 宿主包（`cordis` / `dsh-tools` / `dsh-system-prompt` / `schemastery`）在引擎树里
  是**直接依赖**，版本取自当前开发树已解析的版本，保证插件 import 与引擎用同一份。

Node 运行时（`fetch-node.mjs`）：

- 默认只取**宿主架构**；交叉出包时用 `--target` 指定。
- 本机 Node 版本与 `NODE_VERSION` 一致时**直接复用** `process.execPath`：harness 的
  原生插件（koffi、node-pty）就是用它编译的，ABI 必然匹配，而且不用下载。
- 否则从 nodejs.org 下载（`--http1.1` + 断点续传），缓存在 `src-tauri/.cache/`。

CI（`.github/workflows/`）：

- `release.yml` 打 `v*` tag 时出包：git-cliff 生成更新日志 → 双架构构建 → 发布草稿。
- `build.yml` 在 `main` / `feat/dsh-engine` 上做构建校验。
- **每个架构跑在自己的 runner 上**（arm64 用 `macos-14`，x86_64 用 `macos-13`）：
  原生插件是给运行机器编译的，arm64 runner 造不出 x86_64 的引擎。
- workflow 里的 `node-version` 必须与 `fetch-node.mjs` 的 `NODE_VERSION` 一致。

## 签名与公证

**结论先说**：公证（notarization）**必须**有付费的 Apple Developer Program 会员
（$99/年）和 Developer ID 证书，没有免费途径，也没有技术绕道。免费 Apple ID 只能给
「开发签名」（装到自己的设备上调试），既拿不到 Developer ID，也不能提交公证。

没有会员时能做、且已经做掉的部分：

| 项 | 状态 | 作用 |
|---|---|---|
| **ad-hoc 签名**（`signingIdentity: "-"`） | ✅ 已启用 | 让 bundle 内部自洽：`codesign --verify --deep --strict` 通过、Resources 被封存（2.4 万文件）。避免 "app is damaged" 这类**无法自愈**的报错。 |
| **JIT entitlements** | ✅ 已启用 | 内置 Node 需要 `allow-jit` 等权限才能在 hardened runtime 下启动；证书换成 Developer ID 后这份 entitlement 同样适用。 |
| **release notes 写清安装步骤** | ✅ 已加到 workflow | 用户知道该敲哪条命令，而不是面对「无法打开」发呆。 |
| 公证 | ❌ 需要会员 | Gatekeeper 仍会 `spctl rejected`，首次打开要清隔离属性。 |

ad-hoc 之后用户侧仍然要做一次（这是唯一剩下的一步）：

```bash
xattr -dr com.apple.quarantine "/Applications/Asumi Agent.app"
```

或右键 app →「打开」；macOS 15 起若仍被拦，去「系统设置 → 隐私与安全性」点「仍要打开」。

> ad-hoc 签名解决的是「签名不一致导致的 damaged」，**不是**「未识别开发者」。
> 后者只能靠 Developer ID + 公证，或者用户手动放行。

### 以后拿到会员要改什么

1. 在仓库 secrets 里放 `APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、
   `APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID`。
2. 删掉 `tauri.bundle.conf.json` 里的 `signingIdentity: "-"`（或改成 secret 里的身份）。
3. `entitlements.plist` 保持不变。

`tauri-action` 会自动签名并公证，release 步骤不需要改。

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
| `pnpm dev` | ✅ 壳启动引擎，webview 自动导航 |
| `pnpm build` | ✅ 产出 400MB 自带 `.app` |
| 自带启动 | ✅ 干净 `$DSH_HOME` 下：预置 profile → 用 bundled Node 跑 bundled 引擎 |
| 端口 | ✅ 动态分配（实测 web :61834 / bridge :61831），不撞残留进程 |
| 关停 | ✅ `SIGTERM` → `signal 15; stopping the engine` → 引擎一并退出 |
| 模型路由 | ✅ 默认模型显示 `Qwen3.8-27B-Uncensored-FP8` |
| 工具链路 | ✅ 打包版实测 `pet-mode → always`、`speak → voice Kyoko`、`capture-screen 3420x2224` |

## 已知事项

- DSH 为 developer preview（`0.1.5-rc.1`），升级需重新跑一遍验证表，
  并注意 `schemastery` / `cordis` 的版本要与引擎树一致。
- **未做公证**：ad-hoc 签名已启用（bundle 自洽），但没有 Apple Developer 会员就无法
  公证，首次打开仍要清隔离属性。见上文「签名与公证」。
- 重新组装引擎要 4 分钟（完整 `pnpm install`）；`build-engine.mjs` 在
  `src-tauri/engine` 已是当前版本时会跳过，CI 用 cache 缓存该目录。
- 音频播放（`playAudio` / 桥命令 `audio`）按计划跳过，桥里仍是占位日志。
- 非 macOS 平台：`screencapture` 与 `say` 未实现（截图回 `ok:false`，TTS 退化为日志），
  `fetch-node.mjs` 也只处理 darwin 目标。
