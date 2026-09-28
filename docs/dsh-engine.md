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
  asumi-desktop/         桌面桥：asumi_say / asumi_look / asumi_presence
  asumi-fallback/        主模型不可用时回退到备用 route
  asumi-regenerate/      纯 UI 插件：回答操作条上的「重新生成」按钮
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
  src/pet.rs             桌宠窗口、形态、存在模式、出现模组
  src/sprite.rs          立绘素材目录与清单、asset 协议放行
  src/prefs.rs           设置窗口 + 四个命令
  src/tts.rs             语音服务：懒启动、探测、合成、播放
  src/settings.rs        壳侧设置（读写 app config 下的 JSON）
  src/quick.rs           ⌘E 快捷助手窗口
  src/tray.rs            菜单栏 + 应用菜单
  src/voice.rs           TTS
  ui/index.html          启动页（frontendDist 根）
  ui/pet/index.html      桌宠页面（+ asumi.png）
  ui/settings/index.html 设置页面
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

**应用不认识任何具体供应商。** 有哪些 route、用哪个当默认，全在引擎的用户设置文档里，
由用户自己加 —— DSH 自带的 Models 页可以直接写 `$DSH_HOME/settings.yaml`，本仓库也提供
一个从 Cherry 迁移的脚本：

```bash
# 迁移 route + 凭据（不动默认模型）
node scripts/configure-asumi-model.mjs --modalities text,image

# 想顺带把它设为默认，显式加 --set-default
node scripts/configure-asumi-model.mjs --set-default
```

| 写入位置 | 内容 |
|---|---|
| `$DSH_HOME/settings.yaml` | `llm-pi-ai.providers.<route>`（`api`/`baseURL`/`models`）；仅在 `--set-default` 时写 `agent-default-model` |
| `$DSH_HOME/.credentials.yaml` | 该 route 的 key，以及默认模型所用供应商的 key（权限 600） |

- 路由名默认由服务商名派生（小写连字符），可用 `--route` 覆盖。
- 默认挑选「用户自建服务商」下的启用模型（`preset_provider_id IS NULL`），可用
  `--provider` / `--model` 指定。
- 端点类型 → pi-ai 协议：`openai-chat-completions` → `openai-completions`，
  另有 `openai-responses` / `anthropic-messages`。
- 密钥不写进仓库：设置文档只放 `apiKeyEnv` 引用，值走凭据文件（或 `$DSH_HOME/.env`）。
- 设置文档热重载，改完下一轮请求就生效；`--dump-config` 只打印组合树，
  **不含**用户设置层，验证要走一次真实请求。

默认模型是**新会话的起始模型**。不设置时就是 DSH base 自己的默认
（`deepseek-official` / `deepseek-flash`），也是"什么都不做也能跑"的那一个。

## 模型可用性回退

本地/自建的 route 会关掉，云 route 基本不会。`asumi-fallback` 只处理前者，规则一句话：

> **一次请求要走的 route 是自建的、而它不应答时，把这一次请求改走部署默认模型。**

**不点名任何供应商，也不写死兜底目标**：一个 route 是不是"自建"，只看设置文档里它有没有
`baseURL` —— 有就探测，没有（适配器自己知道怎么连的云 route）就永不猜测。兜底走哪条 route
由**用户自己在设置文档里指定**：

```yaml
asumi:
  fallbackModel:
    provider: <route>
    model: <model>
```

不写这一节就等于不启用（插件会在启动时说明）。**为什么不用 `agent-default-model` 当兜底**：
DSH 的模型选择器在给会话选模型时，会把该模型一并写进默认值 —— 默认值就是"最后选过的那个"，
不是一个稳定的安全路线。用一个会漂移的值做兜底，等于兜底到刚挂掉的那条路上去（这个坑实测踩过）。

判断放在 **`agent/request`** 瀑布上 —— 每次尝试的 provider/model 都在这里定下：

| 为什么是这个位置 | 说明 |
|---|---|
| 比 prompt 组装晚、比请求早 | 改的是"这一次请求"，不动消息、不动会话的模型选择 |
| **重试会重新触发它** | 所以失败的那一轮**能在同一轮内被救回来**，而不是这一轮失败、下一轮才好 |
| 不碰会话选择 | 用户选的模型保持不变，默认模型也不会被改写（早期版本要靠 session-controller 内部 API 切会话选择，已不再需要） |

探测永不阻塞请求：结果按 route 缓存，由会话开始和 30s 定时器在后台预热，
请求只读上一次的答案。首次探测之前按"可用"处理 —— 第一个请求本身就是探测。

| 事件 | 行为 |
|---|---|
| 启动 / `agent/session-start` / 定时器 | 后台预热 route 的探测结果（请求本身从不等待探测） |
| 请求失败（`agent/request-error`） | 立刻把该 route 标记为不可达（比探测结果更权威），并**请求一次重试** |
| 重试（重跑 `agent/request`） | 看到"不可达"→ 改走默认模型 → 这一轮得救 |

需要两条规则防死循环：兜底目标本身失败时不再改（默认模型就是地板），同一轮只救一次。

实测（一个自建 route 真的关着时）：

```
route "<route>" is unreachable; using the default <default-provider>/<model>
retrying this step on the default
（该轮在默认模型上完成，没有 8 秒的无效重试）
```

## 桌面桥

```
asumi_say / asumi_presence / asumi_look     (插件工具)
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

## 桌宠：形态 × 存在方式 × 出现模组

桌宠窗口 `pet`：透明、置顶、跳过任务栏、默认点击穿透，停靠在主屏工作区的右下角。

**形态**（`petForm`）决定她长什么样，其余设置两种形态共用：

| 形态 | 取值 | 含义 |
|---|---|---|
| **SD 贴纸** | `sd` | `ui/pet/asumi.png` 那张 Q 版贴纸（默认） |
| **游戏立绘** | `tachie` | 把游戏的分层立绘按 `pos` 拼起来，只露上半身 |

立绘素材是**受版权保护的游戏资源，不在本仓库**：它放在用户自己的目录（`spriteRoot`，
开发时默认 `<repo>/assets`），应用只读取。每个 PNG 的 `tEXt` 里记着 `pos,x,y,w,h` ——
身体层是空脸立绘、表情层是眉眼嘴，两者按各自的 `pos` 叠在一起才对得上。`sprite.rs` 扫
`no / z1 / z2 / fa` 四个分辨率包及其身体/表情清单，交给页面用 canvas 合成；合成**只绘制
不导出**（图层经 asset 协议跨源，`toDataURL` 会被 canvas 污染挡下），也正因如此表情以后
只是换一张脸文件。`a` 的表情只配 `a` 的身体，`b` 同理。屏幕只放**上半身**：按「盖满窗口、
取上裁」缩放。身体按 `spriteMode` 三种方式挑：`fixed`（固定一具）、`subset`（从勾选的几具
随机）、`all`（全部随机，默认）；随机模式**每次开口换一具**。表情**逐句**由
`asumi_say.lines[].emotion` 决定：20 个取值各自对应一张差分脸（`angry → a0033`），
换脸不换身体。

| 设置 | 取值 | 含义 |
|---|---|---|
| **存在方式** | `always` / `ghost` / `hidden` | 在不在屏幕上；`ghost` 时说完话会收回 |
| **出现模组** | `fade` / `peek-bottom` | 登场与退场的方式（只保留这两种） |

```
ghost + fade        ── 原地淡入淡出
ghost + peek-bottom ── 从右下角探头，说完收回
always              ── 一直可见，模组不参与
```

**窗口不动，动的是内容**：Rust 只负责停靠位置（固定在右下角，用 `monitor.work_area()`
避开菜单栏与 Dock），动画由页面 CSS 用 `body[data-presence][data-appearance]` 与
`.asumi-active` 做 transform / opacity。这样「探头」是一次合成动画，而不是逐帧移动窗口。

**时序**（逐句）：浮现 → 该句字幕出现 → 该句语音播完（壳侧报 `__asumiSpeechDone`）→ 停留
**5s** → 收回；多句时上一句播完停 **2s** 就换下一句，最后一句说完才收回。
计时器在页面里，连续说话会**重置**而不是中途收回。**计时从语音结束算起**：字幕在该句**开始
播放时**出现（预取让这一步几乎不等待），播完才开始计 5s。

字幕本身参考 MurasamePet —— 白字 + 八向深色描边、不画气泡、压在人物下缘
（`text-shadow` 而不是 `-webkit-text-stroke`，后者在部分 WebKit 上会把字心也描掉）。四个
细节是踩出来的：

- **`z-index` 要高于立绘**：立绘带 `transform`（漂浮动画）与 `filter`，会自成层叠上下文，
  且在文档里更靠后，不加 `z-index` 就会被画在字幕上面。
- **窗口放大到 360×420**：字幕区太窄时长句会挤成很多行而被裁；加宽后同一句只占少数几行。
- **整段先预排版，装不下就逐级缩字号**（13→9px），保证长台词不被裁掉。
- **中文与日语同时流式浮现，按各自字数配速、同时收尾**：两行共用总时长（最长行 × 每字
  节奏），短的一行因此拿到更大的间隔，于是同时打完。

设置存储在 `~/Library/Application Support/com.asumi.agent/shell-settings.json`，
托盘、桌宠、设置窗口共用同一份。

菜单栏图标是原版的雪花（`icons/menubar-22.png`）。macOS 不会给非 template 图片自动
反色，所以按系统深浅色**重绘**它：浅色菜单栏用黑色，深色用白色（只改 RGB，保留
alpha，抗锯齿边缘两种背景都成立），并监听 `ThemeChanged` 实时换图。

## 语音

声音是**单独一个仓库**里的本地服务（模型权重 ~240MB + torch 环境，不可能随包）。
懒启动（默认）时在设置里指定仓库路径、服务地址与 Python 路径；改成**手动启动**后应用只
负责连接，仓库路径与 Python 路径就从设置里收起，只留服务地址。

```
asumi_say(lines = [{ja, zh}, …])   ← 模型把回答拆成若干短句
      │
      └─ 逐句：合成 ja ──► afplay ──► 播完 → 字幕停留 → 隔 2s → 下一句
            ▲ 播当前句时，后台已经把下一句合成好（流水线；服务侧自己串行推理）
```

**为什么是「多句短台词」**：声音的开始/结束要和字幕对齐，长句既会挡住人、又让人等很久。
所以让模型把回答拆成 1–6 句短句（每句 ≤ 30 字），一句一张字幕、一句一段语音，像 galgame
逐句播。**为什么是两个字段**：模型只能读日语，所以"这段文本是什么语言"必须是接口的事实，
而不是让壳去猜 —— 之前模型会把中文混进日语行，现在它填错字段是显式的。中文由模型自己
翻译（它就刚说完那句日语）。

注意**正文和 `ja` 是两条通道**：主界面的回答是模型自己的**中文**文字（先輩读的就是它），
`ja` 只被送去合成，`zh` 只作桌宠字幕。正文 = 各句 `zh` 按顺序连起来。把正文也写成日语是
回归 —— `2094ea8` 为了让台词说日语，顺手把「回答一律用日语」写进了 persona，正文因此整段
变成日语，`zh` 反而成了唯一的中文。判定标准是**主界面正文必须是中文**。

| 规则 | 行为 |
|---|---|
| 只朗读 `ja` | `zh` 只是字幕；`ja` 一字不改送去合成（不做分句手术，保留模型自己的标点与停顿） |
| 正文语言 | 中文；日语只允许出现在 `asumi_say.lines[].ja` 里 |
| `ja` 无假名 | 除非用系统语音，否则拒绝发声并记日志（说明它其实是中文/英文，日语前端会读错，不如不说） |
| 服务无应答 | **静默**：不播放、也不换其他嗓音 |
| 应答不是 WAV | 同样静默（校验 RIFF/WAVE 头，不靠 HTTP 状态码） |
| 连续说话 | 新的一次调用会掐掉还在播的上一句，并作废未播的旧队列（按 generation 判定） |
| 句间停顿 | 一句播完停 **2s** 再播下一句；无语音的句子按固定阅读时长（1.8s）走过场 |
| 预取 | 播当前句时后台合成下一句，通常只剩那点间隔（`LINE_GAP`）的等待；服务侧用 `threading.Lock` 串行推理，所以是流水线而非并发 |
| 字幕与声音同步 | 字幕在该句**开始播放时**出现，播完才停 5s 计时；合成再慢也不会提前收掉 |
| 情绪 | **逐句**给：`asumi_say.lines[].emotion`，20 个取值（`default` / `doubt` / `serious` / … / `excited`）。立绘换成对应的差分脸（如 `angry → a0033`，同组）而**身体不变**，SD 贴纸映射到姿势桶；两者都不变嗓音 |
| 旧格式 | 顶层的 `ja` / `zh` **不再接受**，只回一条纠正提示让它改用 `lines`。因为历史里的旧调用会让模型照搬旧形状，必须让它重试一次 |

语音服务契约（`${ttsUrl}`）：

| 接口 | 用途 |
|---|---|
| `GET /health` | 就绪探测（2s 超时） |
| `POST /tts` `{text, length}` | 返回 `audio/wav` |

懒启动：第一次说日语时用 `{python} -m uvicorn asumi_tts.server:app --port <URL 里的端口>`
在仓库目录下拉起服务，之后常驻，随 app 退出结束。

> **服务侧的一个坑（已踩过）**：Style-Bert-VITS2 的 `TTSModel.infer()` 按设计返回
> **int16 量级**的数组（`convert_to_16_bit_wav` 归一化后 `astype(int16)`）。官方
> `server_fastapi.py` 直接把这个 int16 数组交给 `scipy.wavfile.write`，所以没问题；
> 而 `asumi_tts/engine.py` 曾把它转成 float32（值域 ±32767）再交给 `soundfile` 写
> `PCM_16` —— soundfile 期望 float 在 ±1，于是 **91% 的采样被铲平**，听感就是"炸麦 +
> 沙沙声"。修法是在 `engine.py` 里按 config 的 `max_wav_value` 缩到 ±1（权重不动，
> 只是标度）。判据：`rms≈0.95`、`clipped≈90%` 就是它；正常应 `rms≈0.13`、`clipped≈0%`。

## 重新生成

主界面是 DSH 自带的 web client，本仓库没有前端构建 —— 但它是可扩展的：`asumi-regenerate`
是一个**纯客户端**插件，往最终回答的操作条（`conversation.chat.assistant-actions`，本来放
复制与分支）里注入一个「重新生成」按钮。

行为是**分叉回退**：以该回答所在回合**之前**的完整历史 fork 一个新会话，让提问在里面重新
被回答；旧回答原样留在原会话（侧栏把它嵌在原会话下），两个结果都能回看。做不到 DeepSeek 网页
端那种「同屏变体 + 箭头切换」不是偷懒：DSH 的会话 API 只有 create / fork / prompt / cancel /
rename / updateQueue，**没有回退、删除或改写历史**，也没有回合级重放；同屏变体需要引擎支持。

四处实现细节，都是踩出来的：

- **提问从 Chat 节点读回**（最近的前一个 `kind: 'user'`），而不是点击时现存的：刷新后按钮
  会随历史一起恢复，那一刻只有节点可读；中间还可能夹着 context / steering / 工具节点。
- **切点取上一回合的 `turn/end`，不是这条回答的 seq**：`fork` 的 `atSeq` 会被解析成**后继第一
  个 `turn/end`**，所以按回答自己的 seq 去切，边界会落到本回合末尾，回答反而被留下。切点从
  `ChatSnapshot.timeline.turns` 里取。
- **fork 之后不能再发一次提问**：fork 的种子止于本回合的 `turn/start`，因此它**已经带上了这个
  提问的 inbox 记录** —— 提问在子会话里是 pending 的，只是没人驱动它。此时 `prompt` 会把
  pending 那份**和**新插入的一份一起跑掉，子会话里出现两个相同提问。所以实现把 `prompt`
  当作**只用来踢一脚**：带一个已知 `requestId` 发出，再趁第二个回合认领之前用
  `updateQueue(item, { kind: 'remove' })` 把它撤掉，最终由继承的那份作答，且只答一次。
- 客户端插件是手写的 `window.__ModuleLoader__.load({ id, factory })` bundle，只 `require`
  基线里的 `react` / `react/jsx-runtime`，不需要前端构建。节点半边是空的 `apply()`，它存在
  只是为了让这个包成为**已启用的 Loader 条目** —— 这是 client-modules 为 `exports["./client"]`
  发 HTTP bundle 的前提（`package.json` 里的 `dsh.client`）。

第一条回答（第一回合，前面没有可切的回合）走 `create`：在同一个工作区开一个兄弟会话再发问，
所以它不会嵌在原会话下。

## 设置窗口

`prefs.rs` 提供一个静态页设置窗口（无前端构建，和桌宠页同构），入口是托盘「设置…」
与应用菜单的 `⌘,`。它**只放桌面侧的设置**：桌宠形态（SD / 立绘，含素材目录、分辨率包、
加载方式与身体列表）、出现模组、存在方式、语音、点击穿透。
模型、人格、Skill 属于引擎，留在引擎自己的 UI 里，两边不重复。

两个实现细节值得记下来：

- 页面通过 `initialization_script` 注入的 `window.asumi.invoke` 调命令，而**不是**
  `withGlobalTauri`——引擎的 web client 是普通网页，不该被塞进 Tauri 的全局 API。
- 页面必须以**本应用的 origin** 加载（`WebViewUrl::App`）。`file://` 在 IPC 层算
  「远程来源」，自定义命令会被拒绝；这也是 `pet`/`settings` 页面从 `file://` +
  bundle resource 改成 `frontendDist` 下静态资源的原因（早期用仓库路径拼接的写法
  在别人的机器上必然失败——编译期路径是开发机的）。

TTS 语音现在也是设置项：环境变量只在首次运行时**播种**默认值
（`ASUMI_TTS_VOICE`、`ASUMI_TTS_VOICE_JA/_ZH/_EN`），之后以设置为准，用户存下的选择
不会被环境变量悄悄覆盖。

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
| 模型路由 | ✅ 设置文档里的 route 出现在模型选择器，默认模型可改 |
| 设置窗口 | ✅ 打开即读到配置（`settings page asked for its configuration`），往返保存生效 |
| 出现模组 | ✅ 两种模组实测：fade 0↔1、peek 上下＝窗口高度 ↔0、`always` 时模组不参与；停留 5s 且重复说话会续时 |
| 桌宠形态 | ✅ 实测：SD 贴纸；游戏立绘按 `pos` 拼接（身体＋同组表情）只露上半身；三种加载方式（固定/子集随机/全部随机）、素材目录与「测试立绘」按钮 |
| 菜单栏图标 | ✅ 深色主题下渲染为白色雪花 |
| 语音（`asumi_say`） | ✅ 实测（headless）模型按 `lines=[{ja,zh},…]` 输出短句、正文＝各 `zh` 连起来；桌宠按「中文」/「日语」两行显示（白字描边、两行同步流式、同时收尾、长句自动缩字号） |
| 逐句播放 | ✅ 一句一字幕一语音，播完停 2s 再下一句；播当前句时后台预取下一句的音频；新的一次调用作废旧队列 |
| 字幕与语音同步 | ✅ 字幕在该句开始播放时出现，播完（壳侧 `__asumiSpeechDone`）再停 5s；无假名 / 服务无应答时按阅读时长走过场，不会卡住 |
| 语音启动方式 | ✅ 手动启动时设置里隐藏「语音仓库」「Python 路径」，只留服务地址；切回懒启动恢复 |
| 重新生成 | ✅ 实测：按钮在回答操作条（复制/反馈 与 分支 之间）；点击后 fork 出子会话并只重新回答一次提问（父会话保留旧回答，子会话 `2 轮`、提问不重复） |
| 语音失败静默 | ✅ 服务未应答时不发声（日志 `is not answering; staying silent`），不切换其他嗓音 |
| 语音懒启动 | ✅ 首次说日语时拉起服务，就绪后常驻；应用侧收到并播放的音频 `clipped=0.00%` |
| 工具链路 | ✅ 打包版实测 `pet-mode → always`、`speak → voice Kyoko`、`capture-screen 3420x2224` |

## 已知事项

- DSH 为 developer preview（`0.1.5-rc.1`），升级需重新跑一遍验证表，
  并注意 `schemastery` / `cordis` 的版本要与引擎树一致。
- **未做公证**：ad-hoc 签名已启用（bundle 自洽），但没有 Apple Developer 会员就无法
  公证，首次打开仍要清隔离属性。见上文「签名与公证」。
- 回退是**事前**判断：如果正好在探测间隔内 route 挂掉，那一轮仍会失败（下一轮开始走
  默认模型）。回合进行中无法救援——这是 agent loop 决定 route 的时机决定的。
- `asumi-fallback` 通过 `sessionController.agents.selectForNextRequest` 做**会话级**
  选择（不写默认模型）。这是内部 API，DSH 升级后需要重新确认；缺失时插件会明确报错。
- 重新组装引擎要 4 分钟（完整 `pnpm install`）；`build-engine.mjs` 在
  `src-tauri/engine` 已是当前版本时会跳过，CI 用 cache 缓存该目录。
- 音频播放（`playAudio` / 桥命令 `audio`）按计划跳过，桥里仍是占位日志。
- 非 macOS 平台：`screencapture` 与 `say` 未实现（截图回 `ok:false`，TTS 退化为日志），
  `fetch-node.mjs` 也只处理 darwin 目标。
