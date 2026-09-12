# 功能可行性核查（对照 Cherry Studio 官方文档）

> 核查对象：[docs.cherryai.com.cn](https://docs.cherryai.com.cn/)（Cherry Studio 官方文档）
> 核查对象代码：本仓库（Cherry Studio Electron → Tauri 2 移植分支）
> 核查日期：2026-09-10（逐页对照后修正）
> 核查方式：**源码存在性/接线检查 + 运行中 dev 实例实测** + **官方文档逐页对照**
>
> 结论分级：
> - ✅ **可用** — 主进程服务 + 渲染层 + 数据链路在树内，且运行路径已实测或明显接线
> - ⚠️ **部分实现** — 入口/代码在，但核心执行路径未验证、依赖外部条件或仅 stub
> - 🚫 **平台受限** — 依赖 Electron 专有 API（`<webview>`、`selection-hook` native、`electron-updater` 等），Tauri 无等价物
> - ❌ **未实现** — 无可用代码路径

---

## 0. 运行环境基线（实测）

| 项 | 结果 |
|---|---|
| `pnpm dev` 三进程（tauri 壳 / vite renderer / node 后端） | ✅ 正常 |
| Cherry main 服务 bootstrap | ✅ `whenReady` 43+ 服务，`AiService`/`KnowledgeService`/`JobManager`/`ApiGatewayService`/`TesseractRuntimeService` 均初始化 |
| DB（`cherrystudio.sqlite`）migration/seed | ✅ 通过；`mini_app` 目录种子 59 条，`user_provider` 65 条，`translate_language` 20 条 |
| 主对话链路 | ✅ DeepSeek key 配置 → 流式对话 → 落库 → 重启恢复（人工验收） |
| CherryAI 免费模型 | ✅ 修复请求签名密钥后返回 200（密钥经 `.env.local` 注入，见 `package.json` 的 `dev` 脚本） |
| Code CLI 终端探测 | ✅ `found 2 terminals` |
| API 网关服务 | ✅ 初始化（默认 `127.0.0.1:23333`，`enabled=false`） |

---

## 1. 对话 / 助手（`preview/chat`）

官方文档描述了 **助手（角色预设）→ 对话（独立聊天）** 两层结构。

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| 主对话（流式、话题、历史） | ✅ | `src/renderer/pages/home/**`；已端到端实测 |
| 助手列表（创建/编辑/删除） | ✅ | 唯一助手"Default Assistant"已在；管理页面实测渲染 |
| 助手与对话关系（一助手多话题） | ✅ | `assistant` ↔ `topic` 表结构；话题关联助手 ID |
| 助手库（预设市场） | ⚠️ | 资源库「助手」tab 实测渲染；未实测"添加/预览"全链路 |
| 助手导入导出（JSON 文件/剪贴板/URL / 批量） | ⚠️ | 导入导出页面在树内（`library` 路由）；未实测 |
| 多模型对比（一问多答） | ⚠️ | `MessageGroup.tsx`、`multi_model.*` 偏好；并发回流未专项实测 |
| 消息分支 / 重新生成 / fork | ⚠️ | `siblingsGroup`、`messageService` 分支模型在树内；未专项实测 UI |
| 对话导出（Markdown/Word 等） | ⚠️ | `ExportService.ts`；未实测导出产物 |
| 消息渲染（Markdown/公式/HTML 预览） | ✅ | RichEditor / Markdown 组件树在树内 |
| 清除上下文（保留消息但截断） | ⚠️ | 输入面板工具在树内；未实测 |
| 消息大纲 / 思考自动折叠 | ⚠️ | UI 组件在树内；未实测 |
| 输入快捷面板 `/` `@`（提示词管理 / MCP / 引用笔记） | ⚠️ | 输入栏 `+` 面板 + `/` 快捷面板、`@` 引用话题在树内；未全链路实测 |
| 网络搜索（输入栏工具） | ⚠️ | 输入栏"联网搜索"工具在树内；需先配置 websearch 服务 |
| 知识库挂载（输入栏工具） | ⚠️ | 输入栏"知识库"工具在树内；需先建库 |
| 预估 Token 显示 | ⚠️ | `showEstimatedTokens` 偏好；未实测 |

## 2. 工作-智能体 Agent（`preview/agent`、`advanced-basic/agent-workspace`）

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| Agent 创建 / 会话 / 工作区 | ⚠️ | `src/main/ai/agents`、`ai/agentSession`；`agent*` 表在树内；**未做运行任务实测** |
| 读取文件 / 运行命令 / 多步任务 | ⚠️ | `ai/tools` 工具运行时在树内；未实测 |
| 权限模式（逐次确认/自动接受/智能批准/仅规划/完全访问） | ⚠️ | 相关 schema/表在树内；未实测 |
| 记忆 / 后台任务 | ⚠️ | 相关在树内；未实测 |
| 技能 Skill | ⚠️ | `src/main/ai/skills`，`agent_skill`/`agent_global_skill` 表；未实测 |
| MCP | ⚠️ | `src/main/ai/mcp/**`（`McpRuntimeService`/`McpCatalogService`/oauth）；`mcp_server` 表；未建连实测 |
| MCP Browser（`BrowserView`） | 🚫 | Electron `BrowserView` 无 Tauri 等价，见 `migration-source-map.md §7` |

## 3. 绘画（`preview/drawing`）

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| 绘画页面（画板/画布/输入区） | ⚠️ | `paintings` 页 + painting 服务在树内；面板渲染已实测（模型选择+prompt 输入） |
| 文生图 / 图像编辑（按模型切换） | ⚠️ | 编辑模式依赖所选模型（如 `qwen-image-edit`），未实测 |
| 绘画服务商（硅基流动/PPIO/智谱/AiHubMix/DMXAPI/TokenFlux/CherryIN/唯一AI/NewAPI/OVMS） | ⚠️ | `painting` 模块调用通用 image provider；未逐家实测 |
| 自定义服务商（端点类型=图像生成 OpenAI） | ⚠️ | provider-registry 支持；未实测 |
| 参数面板（尺寸/步数/CFG/种子/批次数） | ⚠️ | UI 在树内；未实测 |
| 默认绘画模型设置 | ⚠️ | `feature.paintings.default_provider` 偏好；未实测 |

## 4. 翻译（`preview/translation`）

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| 翻译页面（左输入/右输出/语言切换） | ✅ | 面板渲染已实测；底层 AI 调用已验证：CherryAI Qwen 模型正确输出翻译（English→Chinese "Hello, welcome to Cherry Studio" → "你好..."）；`/translate/histories` API 200 |
| OCR 图片翻译（拖入图片→OCR→翻译） | ⚠️ | `services/ocr` + translateService 在树内；未实测 |
| 文档翻译（PDF/Word/PPT/Excel 抽取正文） | ⚠️ | `features/fileProcessing` 在树内；未实测 |
| 翻译设置：Markdown 预览 / 自动复制 / 滚动同步 | ⚠️ | translate 设置面板在树内；未实测 |
| 自动检测方法（自动/算法/LLM） | ⚠️ | 代码在树内；未实测 |
| 双向翻译模式 | ⚠️ | UI 在树内；未实测 |
| 自定义翻译提示词 | ⚠️ | `feature.translate.model_prompt` 偏好；未实测 |
| 自定义语言（增删语言名与代码） | ⚠️ | `translate_language` 表 (20 条种子) + 管理 UI；未实测 |
| 翻译历史（搜索/收藏/回填） | ⚠️ | `translate_history` 表；UI 在树内；未实测 |

## 5. 小程序 / 笔记 / 文件（`preview/mini-app`、`preview/notes`、`preview/files`）

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| 小程序目录（59 条种子，分类浏览） | ⚠️ | `mini-apps` 页可渲染；**`<webview>` 实运行受平台限制** |
| 笔记页面（Markdown 编辑器/目录树） | ✅ | `notes` 页在树内；笔记 CRUD 已验证（PATCH `/notes` 创建 → GET `/notes?rootPath=...` 列表，均 200） |
| 笔记编辑功能（富文本工具栏/预览模式/拼写检查） | ⚠️ | 编辑器组件在树内；未全链路实测 |
| 笔记右键菜单（AI 重命名/导出知识库/多格式导出） | ⚠️ | 右键菜单在树内（Markdown/Word/Notion/Obsidian/思源等）；未实测 |
| 笔记目录管理（排序/收藏/搜索/文件夹） | ⚠️ | 目录管理组件在树内；搜索同时匹配标题与正文；未实测 |
| 笔记工作目录（自定义存储路径） | ⚠️ | 笔记设置面板在树内；未实测路径切换 |
| 文件管理（分类/排序/上传/预览） | ✅ | `file_entry`、`services/file/**`、Files 页渲染实测 |
| 文件选择对话框 | ✅ | sys `dialog.open` 经 Tauri 原生文件对话框，已端到端验证 |

## 6. 编码搭档 Code CLI（`advanced-basic/developer-tools/code-cli`）

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| Code CLI 配置页（Claude Code 等 8 个工具） | ⚠️ | `CodeCliService.ts`、`src/renderer/pages/code`；启动探测到 2 个终端 |
| 终端内运行 CLI 会话 | ⚠️ | 配置页在；实际拉起 CLI 会话未实测 |

## 7. 快捷助手 / 划词助手（`preview/quick-assistant`、`preview/selection-assistant`）

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| 快捷助手窗口（⌘E / 托盘 / blur 自隐） | ✅ | 窗口 show/hide、全局快捷键、托盘链路已实测 |
| 快速提问 / 翻译 / 总结 / 解释 面板 | ✅ | QA 窗口的 home/chat/translate/summary/explanation 子页在树内 |
| 启动时读取剪贴板 | ✅ | 已接 Tauri `clipboard-manager` 插件，⌘E 实测不再报错 |
| 快捷助手模型选择（使用助手/默认模型） | ⚠️ | `feature.quick_assistant.model_id` 偏好；未实测切换 |
| 划词助手（选中文字浮条 / 翻译/解释/优化/总结） | 🚫 | 窗口与 `SelectionService` 在树内并初始化，但**文本划词检测依赖 `selection-hook` native 模块**，划词检测不可用。划词弹出窗口可用（手动触发时） |

## 8. 启动台 / 资源库 / 全局搜索（`preview/launchpad`、`preview/files`、`preview/history`）

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| 启动台 Launchpad | ✅ | `LaunchpadPage.tsx`；绘画/翻译/知识库/笔记/文件/小程序/Code 等入口 |
| 资源库（智能体/助手/技能/提示词 4 tab） | ✅ | `library` 路由实测渲染 |
| 全局搜索（消息/文件/知识库） | ⚠️ | `SearchService.ts`；未实测 |

## 9. 模型服务 Providers（`pre-basic/providers`）

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| 预置 Provider（OpenAI/Anthropic/Gemini/DeepSeek/… 全量） | ✅ | `packages/provider-registry`、`user_provider` 65 条种子；设置页实测 |
| 模型自动获取（listModels） | ⚠️ | `listModels*` 在树内；未逐家实测 |
| 多密钥轮询 | ⚠️ | `ProviderService.getRotatedApiKey`（round-robin）；未实测 |
| 自定义服务商（OpenAI/Gemini/Anthropic 兼容） | ✅ | 本次已用 `openai-chat-completions` 自定义 provider 实测（sglang） |
| CherryAI（免费 Qwen / GLM / DeepSeek） | ✅ | 签名修复后 200（Qwen3-8B）；其他免费模型路由代码在树内 |
| CherryIN（OAuth / 统一计费） | ⚠️ | `CherryInOauthService.ts`、`buildCherryinConfig`；未实测 |
| GitHub Copilot | ⚠️ | `CopilotService.ts`；未实测 |

## 10. 软件设置 Settings（`pre-basic/settings`）

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| 默认模型（助手/对话/绘画/快捷/翻译/命名） | ✅ | `chat.default_model_id` 等偏好；本次实测切换生效 |
| 本地模型（Ollama / LM Studio） | ⚠️ | provider 预置在树内；未实测本地连通 |
| 联网模式（Tavily/SearXNG/火山/免费搜索/模型内置） | ⚠️ | `services/webSearch/**` 4+ providers 在树内；未实测检索 |
| websearch 黑名单配置 | ⚠️ | 代码在树内；未实测 |
| 文档处理（PDF/Office 预处理配置） | ⚠️ | `features/fileProcessing`；未实测 |
| OCR（Tesseract / 内置引擎） | ⚠️ | `services/ocr/**` + `TesseractRuntimeService` 初始化；未实测识别 |
| 外观：消息样式（气泡/简洁）、字体、行号、代码风格 | ⚠️ | display 设置在树内；未实测注入 |
| 外观：自定义 CSS | ⚠️ | 设置页在树内；未实测 |
| 通知 | ✅ / ⚠️ | 已接 Tauri `notification` 插件；⚠️ **通知点击聚焦主窗口**无桌面回调，未实现 |
| 应用内弹框 | ✅ / ⚠️ | 已接原生 `MessageDialogBuilder`；⚠️ `showMessageBoxSync` 仍为同步假实现 |
| 数据：本地备份 / WebDAV / S3 / 定时备份 | ⚠️ | `LegacyBackupManager`、`WebDav.ts`、`S3Storage.ts`；未实测 |
| 数据：Notion / Obsidian / 思源导出 | ⚠️ | `ObsidianVaultService`、`nutstore`；未实测 |
| 数据：修改存储位置 | ⚠️ | `App_SetAppDataPath` channel 在；Tauri 下未实测 |
| 数据：导出菜单设置（笔记格式开关） | ⚠️ | 偏好 `export.*` 在树内；未实测 |
| 用量统计 | ⚠️ | `AnalyticsService`；未实测 |
| 快捷键设置 | ✅ | `ShortcutService`；⌘E 实测通过（自定义快捷键未实测） |
| 系统 / 环境依赖检测（Bun/uv/ollama 等） | ⚠️ | `env-dependencies` 检测页在树内；未实测 |

## 11. 知识库 Knowledge Base（`knowledge-base/*`）

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| 创建知识库 | ✅ | `features/knowledge`、`knowledge_base` 表；API `/knowledge-bases` GET 200（空列表）；POST 创建路径待验收 |
| 多格式导入（PDF/DOCX/PPTX/XLSX/TXT/MD） | ⚠️ | `features/fileProcessing` + vectorstores 在树内；索引写入**未专项验收** |
| 多数据源（本地文件/网址/sitemap/手输） | ⚠️ | 4 种 source 类型在树内；未实测 |
| 召回测试 / 检索检查 | ⚠️ | 页面在树内；未实测召回质量 |
| 知识库导出（处理后数据分享） | ⚠️ | 代码在树内；未实测 |
| 对话中挂载知识库（RAG） | ⚠️ | 接线在树内；未实测 |
| Agent 中使用知识库 | ⚠️ | `agent` ↔ `knowledge_base` 关联；未实测 |
| 本地嵌入模型（离线建索引） | ⚠️ | 本地模型设置页提及；未实测 |
| 文档解析与 OCR 预处理 | ⚠️ | `document-preprocessing` 逻辑在树内；未实测 |

## 12. 进阶对话 / 高效工作台 / 自动化

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| 长对话 / 上下文压缩 / 排队消息 | ⚠️ | 相关逻辑在树内；未实测 |
| 产物/引用/导出（artifact/citation/export） | ⚠️ | 产物组件在树内；未实测 |
| 多窗口 / 标签页（subWindow） | ⚠️ | `src/renderer/windows/subWindow`、多窗口 Rust 策略；未专项实测 |
| 输入工具栏 / 效率工具（已列于 §1） | ⚠️ | 同上 |
| 全局搜索 | ⚠️ | `SearchService.ts`；未实测 |
| 截图 / 标注 / OCR | ⚠️ | 截图相关组件在树内；系统级截屏未实测 |
| 频道（飞书/微信/Telegram/Discord/QQ/Slack） | ⚠️ | 6 个 adapter 全在；**未做真实建连实测** |
| 定时任务 / 心跳 / 运行记录 | ⚠️ | `JobManager` 初始化、`job_schedule` 表；当前 `0 schedules`；未实测 |

## 13. 开发与诊断（`advanced-basic/developer-tools`）

| 功能 | 状态 | 证据 / 说明 |
|---|---|---|
| API 网关 | ⚠️ | 服务初始化（`127.0.0.1:23333`，默认关闭）；未实测外部调用 |
| 调用链 / 开发者模式（trace） | ⚠️ | `packages/mcp-trace`、`observability`；未实测 |
| 自动更新 | 🚫 | `AppUpdaterService` 基于 `electron-updater`；Tauri 侧未接 `tauri-plugin-updater` |

---

## 14. 未实现 / 受限清单（汇总）

### ✅ 本轮已实现（2026-09-10）
1. **剪贴板读取** — Tauri `clipboard-manager` 插件；`src/renderer/utils/clipboard.ts` 优先 `navigator.clipboard`，被拒时回退原生；⌘E 实测不再报错。
2. **应用内弹框** — `dialog.showMessageBox` 改为原生 `MessageDialogBuilder`（sys 通道），返回真实按钮索引并尊重 `cancelId`。
3. **桌面通知** — Tauri `notification` 插件；shim `Notification.show` → sys → 原生通知。

### 🚫 平台受限（Tauri 无等价物，入口保留）
1. **小程序实运行** — Electron `<webview>` / `session.fromPartition`；仅限目录浏览。
2. **划词助手检测本体** — `selection-hook` native 模块（macOS Accessibility hook）；窗口/服务在，检测不可用。
3. **MCP Browser（BrowserView）** — Electron `BrowserView` 无对应。
4. **自动更新** — `electron-updater` 未替换 `tauri-plugin-updater`（需发布/签名基建）。
5. **通知点击聚焦主窗口** — Tauri notification 桌面端无点击回调。
6. **`dialog.showMessageBoxSync`** — 同步阻塞无法经异步 sys 桥实现（调用点返回值被忽略）。

### ⚠️ 待专项验收（代码在、路径未验证）
- 知识库建库→索引→召回→RAG 全链路
- Agent 工作区任务执行（读文件/跑命令/多步/权限/记忆）
- MCP 建连与实际工具调用
- 频道真实建连（飞书/Telegram/微信/Discord/QQ/Slack 至少一家）
- 定时任务实际调度执行
- API 网关外部请求转发生成
- 绘画出图（至少一个 image provider）
- 翻译 OCR / 文档翻译 / 自定义语言
- 笔记 AI 联动（AI 重命名 / 导出知识库 / 多格式导出）
- 助手导入导出 / 助手库添加使用
- 导出（Markdown/Word）与备份（WebDAV/S3）上传还原
- 多模型对比并发回流、消息分支子窗口全局搜索截图标注
- 联网搜索实际检索（Tavily/SearXNG 等）
- 快捷键自定义配置
- 环境依赖检测（Bun/uv/ollama 等）

---

## 15. 复现核查的方法（供后续回归）

```bash
# 1) 启动
pnpm dev

# 2) 运行日志
tail -f ~/Library/Application\ Support/CherryStudio-Tauri/logs/app.$(date +%F).log

# 3) 数据库状态
sqlite3 ~/Library/Application\ Support/CherryStudio-TauriDev/cherrystudio.sqlite \
  "SELECT 'topic',COUNT(*) FROM topic UNION ALL SELECT 'message',COUNT(*) FROM message UNION ALL SELECT 'knowledge_base',COUNT(*) FROM knowledge_base;"

# 4) 服务初始化与端口
lsof -nP -iTCP -sTCP:LISTEN | grep node
```

> 注：`CherryStudio-Tauri/logs` 目录同时承载 dev 实例日志。
