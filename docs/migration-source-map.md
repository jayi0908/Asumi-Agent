# Cherry → Tauri 源对照表

> 配合 `docs/migration-plan.md`。  
> 基准：Cherry `9ea7e8502472ad24d5db831deea67bfbdcf10fe9`

状态枚举：`pending` | `ported` | `adapted` | `stub` | `blocked`

---

## 1. 目录落点

| Cherry 路径 | 本仓库目标 | 状态 |
|---|---|---|
| `src/renderer/**` | `src/renderer/**` | ported（已同步基准源；未改业务） |
| `src/shared/**` | `src/shared/**` | ported（已同步） |
| `src/main/**` | `src/main/**` | adapted（源已同步，仍含 electron 依赖，待去壳） |
| `src/preload/index.ts` | `src/bridge/window-api.generated.ts` + `transport.ts` | adapted（生成全量 facade） |
| Electron runtime | `packages/electron-shim` | adapted（Node 下运行 main） |
| ipcMain / renderer invoke | TCP hub `src/backend/ipc-hub.ts` + Tauri `backend_invoke` | adapted |
| DataApi `IpcAdapter` | 保持；底层 ipcMain → shim | adapted（不改业务） |
| `packages/**` | `packages/**` | ported（已同步） |
| `migrations/**` | `migrations/**` | ported（已同步） |
| `resources/**` | `resources/**` | ported（已同步） |
| Electron 壳 | `vite.config.ts` + `src-tauri` | adapted（进行中） |

---

## 2. 窗口

| Cherry WindowType | 渲染入口 | Electron 服务 | Tauri 落点 | 状态 |
|---|---|---|---|---|
| `main` | `src/renderer/windows/main` | `MainWindowService` | WebviewWindow `main` | adapted（运行中，renderer 已挂载，DataApi/AI IPC 全链路通） |
| `settings` | `src/renderer/windows/settings` | `SettingsWindowService` | WebviewWindow `settings` | adapted（创建/单例路径已接 `window_open_settings`） |
| `quickAssistant` | `src/renderer/windows/quickAssistant` | `QuickAssistantService` | WebviewWindow `quickAssistant` | adapted（show/hide/blur 自隐实测；⌘E 全局快捷键 toggle 通过；renderer 全渲染、对话链路通） |
| `subWindow` | `src/renderer/windows/subWindow` | `SubWindowService` | WebviewWindow `subWindow` | adapted（经 `window.create` 通用路径，按需创建；未做专项验收） |
| `selectionToolbar` | `src/renderer/windows/selection/toolbar` | `SelectionService` | WebviewWindow `selectionToolbar` | adapted（启动创建为隐藏、showMode=manual 由 SelectionService 控制，实测不在屏）；**划词检测本体依赖 selection-hook 原生模块 = blocked（入口保留）**。已修：shim `resolveWindowRoute` 懒匹配 regex 使 `selection/action` 与 `selection/toolbar` 同落 `selectionToolbar` 标签（导致 500x400 action 池窗口占用 toolbar 标签并被 idempotent show）→ regex 锚定 `/index.html`，且 Rust `window.create` 命中已存在窗口时仅按请求 visible 显示（manual 窗口不再被 reopen 误显） |
| `selectionAction` | `src/renderer/windows/selection/action` | `SelectionService` | WebviewWindow `selectionAction` | adapted（pooled 按需；随 selection 功能解锁） |
| `migrationV2` | `src/renderer/windows/migrationV2` | preboot gate | WebviewWindow `migrationV2` | stub（preboot 迁移门；新装无旧数据时不触发，入口保留） |

---

## 3. 传输与 Data API

| Cherry | 保持 | 替换 |
|---|---|---|
| `DataRequest` / `DataResponse` / handlers / services | 保持 | — |
| `IpcAdapter` (electron `ipcMain`) | 逻辑参考 | `TauriTransportAdapter` / Node 本地 IPC 适配 |
| Renderer DataApi client | 保持 | 底层 invoke 改 bridge |
| Preference / Cache / BootConfig | 保持语义 | 路径改 app data |

---

## 4. `window.api` / IpcChannel

以下由表自动骨架维护（见 `scripts/gen-ipc-map.mjs`，Phase 0 添加）：

| 命名空间 / Channel | Cherry 文件 | Tauri 落点 | 状态 |
|---|---|---|---|
| `DataApi_*` | `main/data/api/core/adapters/IpcAdapter.ts` | bridge + Node backend | adapted（读写已实测：assistants/providers/topics GET、topics POST/GET/DELETE 200/201/204） |
| `Ai_Stream_*` | `main/ai/**`, preload `api.ai` | bridge event stream | adapted（`wc.send`→shim `emitPush`→hub→`backend://event` 链路已验；流式运行时验收待用户配置 provider key） |
| Window / WindowManager | `main/core/window/**`, services | `src-tauri` windows + event | adapted（`backend_invoke` 内拦截 settings 打开/最小化/最大化/全屏） |
| 实时缓存同步 `Cache_Sync` | `main/data/CacheService.broadcastSync`（`BrowserWindow.getAllWindows()`） | shim 返回虚拟窗口 → `webContents.send`→hub | fixed（原 shim `getAllWindows()` 返回 `[]`，导致 renderer 收不到共享缓存实时事件、Chat 完成后不刷新；现返回单个虚拟窗口，`pending→streaming→done` 同步已验证） |
| Dialog / shell（open/reveal/openExternal） | `FileStorage.selectFile`、`FileManager.open/showInFolder`、`ipc.ts App_Select` | hub `sys` 反向桥 → `tauri-plugin-dialog` + `tauri-plugin-opener` | adapted（`dialog.showOpenDialog`/`shell.*` 在 electron-shim 中改走 sys bridge；链路已端到端验证） |
| Tray / Shortcut / Theme | `TrayService`/`ShortcutService`/`ThemeService` | Tauri tray + `tauri-plugin-global-shortcut` + shell 反向事件 | adapted（托盘 click/right-click/menu-popup/quit 链路实测；全局快捷键 ⌘E 真实按键通过，`numsub→numsubtract` 归一化；theme.set/get + system 变化推送已接，视觉切换待人工确认） |
| File / 其余 shell | `FileManager` 等（Node fs 可用部分） | 后端保留 Node 实现 | adapted（fs 类走 Node；仅 dialog/open 走 shell） |
| MCP / Knowledge / … | 对应 main 模块 | 随 Node 后端接通 | adapted（52 services 全部 bootstrap，knowledge/mcp/agents handlers 已注册；写入路径专项验收待做） |
| webview / selection-hook | WebviewService / SelectionService | blocked 候选，入口保留 | blocked（`<webview>` 无 Tauri 等价 → 小程序实运行；selection-hook（macOS Accessibility hook）→ 划词检测本体；入口均保留） |

完整 ~360 channel 列出后必须逐项 `ported|adapted|stub|blocked`。禁止用「本阶段不做」删除 preload 字段。

---

## 5. Sidebar / Settings 入口（不得裁剪）

### Sidebar（`preference` 可见集 + 全部 icon keys）

| key | route | 状态 |
|---|---|---|
| assistants | `/app/chat` | adapted（DataApi 读写 + 流式对话 + 重启恢复全链路实测通过） |
| agents | `/app/agents` | adapted（资源库「智能体」tab 实测渲染，DataApi 读写） |
| store | `/app/library` | adapted（资源库 智能体/助手/技能/提示词 4 tab 实测渲染） |
| paintings | `/app/paintings` | adapted（模型选择 + prompt 输入实测渲染；出图需配 image provider） |
| translate | `/app/translate` | adapted（源/目标语言/交换/历史/设置实测渲染；provider 已接 Qwen） |
| mini_app | `/app/mini-app` | adapted（全量应用目录实测渲染）；**`<webview>` 实运行为 blocked（Chromium webview tag 无 Tauri 等价，入口保留）** |
| knowledge | `/app/knowledge` | adapted（搜索/添加/默认库/空态实测渲染；建库→索引写入路径待专项验收） |
| files | `/app/files` | adapted（文档/图片/文本/所有文件 + 排序 + 空态实测渲染；dialog 选文件走 sys 桥） |
| code_tools | `/app/code` | adapted（8 个 CLI 工具配置页实测渲染；终端 2 个已探测到） |
| notes | `/app/notes` | adapted（.md 导入区/面包屑/空态实测渲染） |
| openclaw | `/app/openclaw` | adapted（未安装态 + 安装/文档按钮诚实展示） |

### Settings 窗口路由

以 Cherry `src/renderer/pages/settings` 与路由树为准（provider、model、mcp、websearch、data、shortcut、about…）全部保留，状态随模块更新。

---

## 6. 先前错误实现（已作废）

| 错误方向 | 处理 |
|---|---|
| 裁剪 Sidebar 仅 Chat/Agents/Settings | 作废 |
| 自造 rusqlite schema 顶替 Cherry migrations | 作废 |
| 自造简化 Chat/Settings UI | 已从工作区清除（Phase 0） |
| Asumi Skill 作为迁移范围 | 作废；不在本移植范围 |
| 「Intentional Differences」功能排除表 | 作废 |

---

## 7. 平台限制登记（仅 platform，不缩产品）

| 能力 | 风险 | 策略 |
|---|---|---|
| Electron `<webview>` partition | 高 | 独立窗口/后续方案；入口不删 |
| selection-hook 原生 | 高 | native crate 或 stub |
| Chromium session proxy | 中 | 系统代理 + reqwest/Node |
| BrowserView MCP browser | 高 | 重实现或 stub 标明 |

更新本表时写日期与策略变更。
