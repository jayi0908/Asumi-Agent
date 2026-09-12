# Cherry Studio Electron → Tauri 2 移植计划

> 分支：`migration-plan`
>
> 性质：**平台替换（Electron → Tauri 2）**，不是产品重设计
>
> 上游：`~/codes/PULL/cherry-studio`
>
> 基准提交：`9ea7e8502472ad24d5db831deea67bfbdcf10fe9`
>
> ⚠️ **阅读顺序**：本文件 §5 的分阶段 checkbox 是**最初计划**，很多已完成仍未勾选；
> **实际进度一律以 §9「当前执行状态」为准**。功能可行性核查见 [`feature-coverage.md`](./feature-coverage.md)。
> 文档总索引见 [`README.md`](./README.md)。

---

## 0. 一句话目标

把 **Cherry Studio 原仓库代码**从 Electron 桌面壳换成 Tauri 2 桌面壳；**功能、交互、信息架构、数据语义、UI 与 Cherry Studio 保持一致**。允许的改动只有「Electron API 及其构建/打包管线」到「Tauri 2 等价物」的替换。

本仓库当前的 Asumi Agent 业务实现 **不是** 本次工作的源，也不是验收基准。不得把 Asumi Skill、裁剪后的侧栏、简化版 Chat、自写 Provider schema 等混入结果产品。

---

## 1. 硬性规则（违反即返工）

### 1.1 允许改动的唯一集合

| 类别 | 允许 |
|---|---|
| 进程模型 | Electron main/preload/renderer → Tauri rust shell +（见架构）Node 后端 + 前端 WebView |
| 窗口 | `BrowserWindow` / WindowManager → Tauri `WebviewWindow` 及等价多窗口策略 |
| IPC | `ipcMain` / `ipcRenderer` / `contextBridge` / `window.api` → Tauri `command` / `event` / 同名 facade |
| 系统 API | dialog、fs、shell、clipboard、tray、globalShortcut、notification、path、updater 等 → 对应 Tauri plugin 或短 Rust 封装 |
| 构建 | `electron-vite` / `electron-builder` → Vite（前端）+ Tauri CLI（打包）；可保留 pnpm workspace |
| 安全 | capability / CSP 按 Tauri 2 需要声明（功能集合仍对齐 Cherry） |

### 1.2 明确禁止

1. **禁止砍功能**：不得以「先不做 Knowledge/MCP/Notes/…」为由删除侧栏项、设置页、Data API 实体、路由或能力（即使第一阶段能力用 stub，**入口与信息架构必须存在**，并标明 stub 边界）。  
2. **禁止加功能**：不得引入 Cherry 不存在的产品能力或交互（含 Asumi Skill、桌宠专属流程、营销 Landing 等）。  
3. **禁止「理解性重写」**：不得用新 schema、新 Rust service 目录、新 UI 框架「按感觉重做」Chat/Settings。优先 **迁移 Cherry 源文件**，再替换调用面。  
4. **禁止「看起来像」验收**：不得用自绘近似界面替代 Cherry 同文件行为与样式。  
5. **禁止双基准**：产品行为以 Cherry 基准提交为准；本仓库 `main` 旧代码仅作历史，不参与验收。  
6. **禁止偷偷跟随上游**：基准 commit 变更必须单独记录；不得无提示 merge Cherry `main` 最新。

### 1.3 保真优先序（有冲突时）

1. 业务语义与数据模型（Data API、Preference、消息流）  
2. 信息架构与路由（Sidebar、Settings 全部分类、多窗口）  
3. IPC/窗口行为（快捷助手、设置单例、托盘等）  
4. UI 结构与状态（loading/empty/error，Cherry 组件树）  
5. 样式 token / 动效  
6. 实现语言与运行时细节（仅当上列已一致，可换实现）

---

## 2. 源与目标

### 2.1 固定基准

```text
Cherry Studio path:    ~/codes/PULL/cherry-studio
Cherry Studio commit:  9ea7e8502472ad24d5db831deea67bfbdcf10fe9
Migration branch:      migration-plan
```

开始每一阶段前确认工作树基准未漂移。更新基准 = 单独提交 + 列出影响面。

### 2.2 源目录（必须原样迁移 / 适配，不得重发明）

| 源路径 | 角色 |
|---|---|
| `src/renderer/**` | 产品 UI（主窗口、设置、快捷助手、selection 等） |
| `src/shared/**` | `IpcChannel`、Data API schema、preference、共享类型 |
| `src/main/**` | 生命周期、WindowManager、Data/AI/MCP/文件等域逻辑 |
| `src/preload/**` | `window.api` 合同（移植后变为 Tauri facade 生成源） |
| `packages/**` | ai-core、ui、provider-registry、vectorstores 等 |
| `migrations/**` | Drizzle/libSQL schema 与迁移 |
| `resources/**`、i18n 资源、配置 | 与 Cherry 一致 |

### 2.3 目标形态（本仓库）

> 实际落地与下方推荐布局略有差异：Tauri 壳落在仓库根 `src-tauri/`，Node 后端落在 `src/backend/`（由 Rust `lib.rs` spawn，经 TCP hub 与渲染层通信），未使用 `apps/desktop/`。以仓库现状为准。

推荐布局（实现时可微调目录名，**不可改产品语义**）：

```text
/
├── apps/
│   └── desktop/                 # Tauri 2 壳 (src-tauri + 窗口配置)
├── packages/                    # 从 Cherry packages 迁入，尽量无逻辑 diff
├── src/
│   ├── renderer/                # 自 Cherry renderer 迁入
│   ├── shared/                  # 自 Cherry shared 迁入
│   ├── main/                    # Cherry main，去掉 electron 直接依赖后的 Node 后端
│   └── bridge/                  # 唯一允许的「平台层」：window.api 实现 + Tauri 适配
├── migrations/                  # 自 Cherry 迁入
└── docs/
    ├── migration-plan.md        # 本文件
    └── migration-source-map.md  # 文件级对照与适配清单
```

前置阶段可在仓库根临时用 `vendor/cherry` 硬链接/拷贝减少搬迁次数，但 **最终产品源必须落在可构建树内**，且 diff 相对 Cherry 可审查。

---

## 3. 架构：仅替换壳，不替换产品芯

### 3.1 为什么不能「手写一套 Rust domain + 自造前端」

Cherry 主进程 ≈ 700 源文件 / 13 万+ LOC，渲染进程 ≈ 1270 源文件 / 18 万+ LOC，IPC ≈ 360+ channel，`window.api` ≈ 1000 LOC 面。任何「按功能切片从零实现」都会引入 schema/工作流漂移——**这正是上一版失败的原因**。

### 3.2 目标进程与边界

```text
┌─────────────────────────────────────────────────────────────┐
│  Tauri 2 (Rust)                                             │
│  · Webview 多窗口标签 (main / settings / quickAssistant / …)│
│  · tray / globalShortcut / dialog / fs / shell / clipboard  │
│  · 与 Node 后端的本地 IPC（stdio JSON-RPC 或 localhost）      │
│  · 仅暴露与 Cherry 能力对等的 capability                     │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Node 后端 = Cherry `src/main` 适配层                         │
│  · 保留 Application DI、DbService(libSQL+Drizzle)、DataApi    │
│  · 保留 AiService / MCP / Knowledge / Window 领域服务语义     │
│  · 删除 electron 的 BrowserWindow/ipcMain 直接依赖            │
│  · IpcAdapter → 新增 TauriTransportAdapter（同 DataRequest）  │
└───────────────────────────┬─────────────────────────────────┘
                            │ DataRequest / IpcChannel 语义不变
┌───────────────────────────▼─────────────────────────────────┐
│  Renderer = Cherry `src/renderer` + packages/ui 等            │
│  · 路由、Sidebar、设置树、Chat/Agents/… 全部保留              │
│  · window.api 面保持 WindowApiType 兼容                       │
│  · 底层实现改调 @tauri-apps/api 或 bridge                     │
└─────────────────────────────────────────────────────────────┘
```

原则：

1. **DataApi 已与传输解耦**（见 Cherry `IpcAdapter` 注释）：优先加 `TauriAdapter` / Node socket adapter，**不动** `ApiServer` 与 handlers。  
2. **`window.api` 形状不变**：TypeScript 类型与调用点保持；只换实现文件（由 preload 变为 bridge）。  
3. **窗口类型与标签对齐** Cherry `WindowType`：`main`、`settings`、`quickAssistant`、`subWindow`、`selectionToolbar`、`selectionAction`、`migrationV2`。  
4. **第一阶段允许 Node 后端**承载几乎全部原 main 逻辑；Rust 只做壳与系统 API。避免「一边用 rusqlite 自造表、一边丢 Cherry schema」。  
5. 后续若某服务确需改写成纯 Rust，必须 **行为对等 + 数据兼容** 后才能替换，且按模块单独 PR。

### 3.3 Electron → Tauri 映射表（骨架）

| Cherry (Electron) | Tauri 2 落点 |
|---|---|
| `BrowserWindow` + WindowManager | `WebviewWindow` + Rust `windows` 模块（策略抄 WindowManager/registry） |
| `ipcMain.handle` / `webContents.send` | command + event；或 Node 后端 + bridge 转发 |
| `contextBridge` + preload | `src/bridge/window-api.ts` 注入 `window.api` |
| `globalShortcut` | `tauri-plugin-global-shortcut` |
| `Tray` | Tauri tray API |
| `dialog` / `shell` / `clipboard` / `fs` | 对应 plugin |
| `electron-updater` | `tauri-plugin-updater`（发布后再接，行为对齐） |
| `<webview>` / session partition | 分阶段：独立 webview 窗口 / iframe 限制说明文档化；**不得静默删除 Mini App 产品入口** |
| `selection-hook` 等原生 | 单独 native crate 或阶段 stub + 标注；入口仍在 |
| libSQL + Drizzle | **保留 Node 实现**，路径改 Tauri app data dir |

完整 channel 级对照写入 `docs/migration-source-map.md`，由脚本可从 `IpcChannel.ts` + `preload/index.ts` 生成骨架后人工填。

---

## 4. 范围：与 Cherry 一致（无排除清单伪装）

产品范围 = **基准提交时 Cherry Studio 已有的全部用户可见功能与设置面**。

包括（不完整列举，以 Cherry Sidebar / Settings 路由 / Data entities 为准）：

- Chat / Assistants / Topics / 流式消息  
- Agents  
- Library/Store、Paintings、Translate、Mini Apps、Knowledge、Files、Code tools、Notes、OpenClaw  
- 多窗口：Settings、Quick Assistant、Selection Toolbar/Action、SubWindow  
- Provider/Model、MCP、WebSearch、API Gateway、Channels、Shortcuts、Backup、About 等设置全部分类  
- Preference / Cache / DataApi / 迁移管线  

**阶段可以**只做「壳 + bridge + stub 后端」使窗口能起来，**阶段不可以**改写 Sidebar 只留 Chat/Agents，或把设置缩成子集。

实现完整度允许使用：

```text
status: ported | adapted | stub | blocked
```

- `stub`：入口与路由在，调用返回明确错误或空态，UI 不假成功。  
- `blocked`：依赖暂无 Tauri 等价（如某 Chromium-only API），在 source-map 记录原因与后续方案。

---

## 5. 分阶段执行

每一阶段结束时：应用可构建；相对上一阶段 **不减少** Cherry 信息架构入口；`docs/migration-source-map.md` 更新。

### Phase 0 — 重置与源对齐

- [ ] 丢弃「按 Asumi 解读重写」的半成品（自造 pages、自造 domain schema、裁剪 sidebar、Asumi Skill 集成等）。  
- [ ] 固定 Cherry 基准提交并在本文件维护。  
- [ ] 建立迁入方式（拷贝 / submodule / sparse checkout）与目录落点。  
- [ ] 从 `IpcChannel.ts` + `preload/index.ts` 生成 channel/API 对照表骨架。  
- [ ] 定义 `window.api` 兼容测试（类型级 + 烟雾调用）。  

验收：仓库中可定位完整 Cherry renderer/main/shared/packages 源，且无「Asumi 业务」与 Cherry 源混杂伪装成已移植。

### Phase 1 — Tauri 壳 + 多窗口

- [ ] Tauri 2 工程：窗口标签对齐 WindowType。  
- [ ] 主窗口加载 Cherry renderer 构建产物（或 dev server）。  
- [ ] Settings / Quick Assistant 等窗口创建/单例/尺寸/定位策略对齐 Cherry 对应 Service。  
- [ ] tray、globalShortcut 骨架对齐行为描述。  

验收：能打开主窗口与设置窗口；空白/加载态之外不出现自造 Landing。

### Phase 2 — Bridge：`window.api` + DataApi 传输

- [ ] 实现 `window.api` facade，TypeScript 类型与 Cherry `WindowApiType` 对齐。  
- [ ] 启动适配后的 Node 后端（Cherry main 去 Electron 壳）。  
- [ ] DataApi：`IpcAdapter` 平行增加 Tauri/Node 传输，handlers/services **零业务改写**。  
- [ ] 其余 channel 按模块接通或明确 stub。  

验收：renderer 中既有 DataApi hooks 能完成至少一条真实读路径（如 preference / assistants list）；网络无关路径不依赖假数据。

### Phase 3 — Chat 主路径对等

- [ ] Provider/Model/Assistant/Topic/Message 读写走 Cherry services。  
- [ ] AI 流式：`Ai_Stream_*` / stream manager 语义保持，仅换推送通道。  
- [ ] 错误、取消、重试、持久化与 Cherry 一致。  

验收：对照 Cherry，同一用户操作序列结果一致（配置 → 对话 → 重启恢复）。

### Phase 4 — 其余功能模块按 Cherry 模块边界接通

顺序建议跟随 Cherry 依赖（文件/知识库/MCP/…），**每一模块**：

1. 打开 source-map 该节  
2. 迁移/接通 main service + renderer 现状代码  
3. 替换 Electron API 为 bridge  
4. 人工对照 Cherry 操作路径  

禁止为「进度」先写简化 UI。

### Phase 5 — 系统集成与发布

- [ ] 自动更新、协议、单一实例、路径、备份目录对齐  
- [ ] capability 最小化且覆盖已 port 功能  
- [ ] 打包目标 macOS/Windows/Linux（按 Cherry 支持矩阵逐步）  
- [ ] LICENSE / 上游归属 / AGPL 合规说明  

### Phase 6 — 对等回归

- [ ] 功能清单 checkbox 来自 Cherry 路由与 Settings 导航（不是自拟列表）  
- [ ] 关键路径与 Cherry 并排操作  
- [ ] 列出全部 `stub`/`blocked` 与原因；无静默缺失  

---

## 6. 工作方法（防止再次跑偏）

### 6.1 默认操作顺序

对任意功能：

1. 在 Cherry 定位源文件与行为（主+渲染+shared）。  
2. 整文件/整模块迁入目标树。  
3. 编译报错中 **只改** Electron 导入与 bridge 调用。  
4. 跑对照验收。  
5. 在 source-map 标记 `ported`/`adapted`。  

不得先写空白页面再「慢慢填」。

### 6.2 Diff 纪律

相对 Cherry 同路径文件：

- 期望 diff ≈ import 与 `window.api`/路径/环境探测。  
- 大段逻辑重写必须在 PR 中证明「Electron API 无法等价」且行为 checklist 完整。  

### 6.3 每个 PR 模板

```markdown
## Cherry source
- Baseline commit:
- Paths touched (upstream):

## Platform-only changes
- Electron API removed:
- Tauri/bridge replacement:

## Product surface
- UI/routes/data behavior change? (must be No, or list unavoidable platform limits)

## Status
- ported | adapted | stub | blocked

## Verification
- Compared against Cherry steps:
- Automated:
```

### 6.4 Definition of Done（模块级）

- 同源文件可映射；非平台 diff 可解释。  
- 无自造旁路数据层。  
- `window.api`/DataApi 合同未缩小。  
- 对等操作清单通过。  
- stub/blocked 已登记，无假成功。  

---

## 7. 清理先前错误迁移的标准

上一轮把本仓库做成「裁剪版 Asumi + 自造 Rust domain」属于 **错误方向**，处理：

| 类型 | 处理 |
|---|---|
| 自造 `src/pages/*`、`features/*` 简化 Chat/Settings | 删除，以 Cherry renderer 为准重迁 |
| 自造 `src-tauri` domain/sqlite schema 顶替 DataApi | 删除或降级为壳；数据以 Cherry migrations 为准 |
| 计划中的功能排除表 / Asumi Skill 条款 | 自本文件起作废 |
| 仅保留托盘/快捷键等已验证的 **壳行为** 时可参考实现，但窗口语义改对齐 Cherry | 对照后接入 |
| `docs/migration-source-map.md` 旧「Intentional Differences 砍功能」 | 整表重写为 channel/文件对照 |

---

## 8. 成功标准（产品级）

用户使用 **Tauri 构建的本应用** 时：

1. 侧栏/设置/路由能看到与 Cherry 基准一致的功能集合入口。  
2. 主聊天路径：配置 Provider → Assistant → 多轮流式对话 → 重启数据仍在，行为对照 Cherry。  
3. 未实现完的模块以 stub/blocked 诚实存在，**不是**被产品经理式删掉。  
4. 代码审查能指出：「这段来自 Cherry 的哪条路径，平台改了哪一行」。  

若结果是「另一个灵感来自 Cherry 的 AI 客户端」，则迁移失败。

---

## 9. 当前执行状态

| 项 | 状态 |
|---|---|
| 计划纠正（去 Asumi 混杂、1:1 平台替换） | **已完成（文档）** |
| 错误半成品清理 | **已完成**（清除自造 pages/domain；重置为壳） |
| Cherry 源迁入 | **Phase 0 进行中**：`src/{renderer,main,shared,preload}` + `packages/` + `migrations/` 已自基准同步；`scripts/sync-from-cherry.sh` |
| IPC 清单 | **已生成** `docs/generated/ipc-channel-map.md`（`pnpm gen:ipc-map`） |
| Tauri 壳 | **最小多窗口壳**：label 对齐 Cherry WindowType；settings 可创建；去除 Asumi 专属 LLM/Skill 命令 |
| Bridge | **adapted**：`pnpm gen:window-api` 从 preload 生成全量 api；transport → Tauri `backend_invoke` |
| DataApi 传输 | **adapted**：electron-shim `ipcMain.handle` 经由 TCP hub relay 到 Tauri |
| Node 后端 | **done**：`src/backend` + `packages/electron-shim` + TCP hub；52 Cherry services 全部 bootstrap；DB migration/seed 通过 |
| Tauri 壳 | **done**：窗口 label 对齐 Cherry WindowType；自动 spawn Node backend + IPC relay |
| `pnpm dev` 端到端 | **done**：Tauri 窗口 + Vite renderer + Cherry backend 全部启动并通信 |
| 响应性能 | **fixed**：`backend_invoke`/`backend_send` 由同步命令（占 Tauri 主线程、逐调用阻塞事件循环）改为 `async + spawn_blocking`，并行 DataApi 不再冻结 UI；事件推送去除每事件 stderr 日志 |
| 启动阻塞 | **fixed**：`setup` 不再等 Node 后端连上才显示窗口（原 20s 中约 10s+ 卡在 tsx 冷启动）；改为先显示窗口、后台 spawn 后端，`invoke` 在连接就绪前自动排队等待 |
| 设置窗口空白 | **fixed**：根因是 `install.ts` 的 `installElectronShim()` 对只读 `window.electron` 直接赋值抛 `TypeError: Cannot assign to read only property 'electron'`，模块级崩溃导致两个窗口均无法挂载；改用 `Object.defineProperty`（configurable）重定义。已在浏览器模式 + 真实 Tauri 窗口双重验证：主窗口完整侧栏渲染、设置窗口 provider/模型服务/API key 输入全部显示，DataApi GET 200 |
| 系统 API（dialog/shell） | **adapted**：新增 Node→Tauri `sys` 反向桥（hub `sys` 消息）；electron-shim `dialog.showOpenDialog` / `shell.openPath` / `showItemInFolder` / `openExternal` 走真实 Tauri dialog/opener，`App_Select`、`File_Select`、`File_Open`、`File_ShowInFolder` 不再 stub 返回 canceled（链路已用模拟 shell 端到端验证） |
| Chat 主路径对等 | **done（人工验收通过）**：DeepSeek key 配置 → 流式对话 → 重启恢复全链路实测通过。流式：`Ai_Stream_Open` 返回 started → 33+ chunks → done → DB 落库 `status: success`（含 reasoning + text parts）。期间修复两个阻塞点：① Chat UI 消息不实时刷新 —— `CacheService.broadcastSync` 依赖 `BrowserWindow.getAllWindows()`，而 electron-shim 返回 `[]` 导致 `Cache_Sync` 实时事件从未到达 renderer，`useTopicDbRefreshOnTerminal` 不触发；改为返回单个虚拟窗口（`webContents.send`→`emitPush`→hub），验证收到 `pending→streaming→done` 三跳缓存同步。②（此前已修）窗口空白崩溃 |
| 后端生命周期 | **fixed**：定位到崩溃根因 —— Cherry `windowUtil.ts:69`/`QuickAssistantService.ts:470` 调 Electron 专有 `process.getSystemVersion()`，Node 下 unhandledRejection 直接杀后端（此前表现为「后端静默死亡、窗口卡死 90s」）。backend 入口补 `process.getSystemVersion` 平台 shim（macOS 取 `sw_vers -productVersion`，其余 `os.release()`）+ uncaught/unhandled/SIG*/exit 日志钩子。Rust 侧新增 watchdog：子进程退出或 hub socket EOF → 同端口自动 respawn（最多 5 次连续失败）；`process_group(0)` 独立进程组，退出时整组 SIGKILL（Cmd+Q 走 `RunEvent::Exit`，SIGTERM 走自装 signal 钩子 → `AppHandle::exit`），不再留孤儿 pnpm/tsx/node。实测：kill 后端→自动复活同端口；SIGTERM 壳→0 残留 |
| 全局快捷键 | **adapted（实测）**：`CommandOrControl+E`（快捷助手 toggle）真实按键 ⌘E → QA 窗口出现，再按消失，全链路（OS→muda→`shortcut-press`→hub→ShortcutService→CommandService→QuickAssistantService）通过。`numsub`（数字小键盘减号）Tauri parser 不识别 → shim 内归一化 `numsub→numsubtract`，启动不再报 parse 错误 |
| 托盘 | **adapted（链路实测）**：左键→`tray-event click`→`TrayService` click（`feature.quick_assistant.click_tray_to_show=true` 时 showQuickAssistant，已验证 QA 出现）；右键→真机 NSMenu 弹出（`tray.menu-popup` 传 item 描述符重建，id 动态 `mi_N`，日志可见 显示窗口/快捷助手/划词助手/退出）；菜单项→`tray-menu-click mi_7`→QA 出现。注：本机菜单栏 item 被系统排到屏外（X≈-4068，菜单栏拥挤所致），真实鼠标点击暂未做肉眼验收，事件链路均已验证 |
| 快捷助手窗口 | **adapted（实测）**：`quick-assistant:show/hide` → 真 Tauri 窗口 550x400 top-layer 出现/消失，blur 自动隐藏生效（焦点切走即 alpha 消失）；QA renderer（`windows/quickAssistant`）完整渲染（输入框/快捷操作/ESC 提示）；QA 对话发送→provider 响应链路通（当前 `Unauthorized` 为 QA 助手用 Qwen key 未配置的数据问题，非平台问题） |
| 其余模块（侧栏全量） | **adapted（页面级实测）**：浏览器模式逐一点开验证全部渲染真实 DataApi 页面：Chat、资源库（智能体/助手/技能/提示词）、绘画（模型选择+prompt）、翻译（源/目标语言+Qwen+历史）、小程序（全量应用目录）、知识库（搜索/添加/空态）、文件（文档/图片/文本/排序/空态）、Code（8 个 CLI 工具配置页）、笔记（.md 导入/面包屑/空态）、OpenClaw（未安装态+安装入口） |
| 系统能力补齐（本轮） | **done**：① **剪贴板**：接入 `tauri-plugin-clipboard-manager`，`src/renderer/utils/clipboard.ts` 在 `navigator.clipboard.readText()` 被 WKWebView 拒绝时回退原生插件（修复快捷助手 `Failed to read clipboard`）；② **`dialog.showMessageBox`**：由"返回最后一个按钮"改为原生 `MessageDialogBuilder`（sys 通道，返回真实按钮索引）；③ **桌面通知**：接入 `tauri-plugin-notification`，shim `Notification.show` → sys `notification.show` |
| 下一步 | ① 功能面逐项验收见 [`feature-coverage.md`](./feature-coverage.md)；② MCP / Knowledge 建库写入路径、频道建连、定时任务调度、API 网关外部请求；③ webview（小程序实运行）与 selection-hook 原生能力（平台受限）；④ 自动更新接 `tauri-plugin-updater`（需发布/签名基建）；⑤ `dialog.showMessageBoxSync`、通知点击聚焦（平台/同步限制）；⑥ 打包（`tauri build` macOS） |
