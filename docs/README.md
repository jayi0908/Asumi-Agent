# docs 目录索引

本目录记录 **Cherry Studio（Electron）→ Tauri 2 移植** 的计划、状态与功能核查结果。

## 文档地图

| 文档 | 性质 | 说明 |
|---|---|---|
| [`feature-coverage.md`](./feature-coverage.md) | **功能核查（持续更新）** | 对照官方文档 docs.cherryai.com.cn 逐项核查可行性；含未实现/平台受限/待验收清单 |
| [`migration-plan.md`](./migration-plan.md) | 计划（进行中） | 移植总计划、硬性规则、分阶段任务；§9 为当前执行状态 |
| [`migration-source-map.md`](./migration-source-map.md) | 状态表（进行中） | 目录/窗口/传输/Sidebar 的文件级对照与状态 |
| [`CHERRY_BASELINE`](./CHERRY_BASELINE) | 基准 | 对照的 Cherry 上游 commit |
| [`generated/ipc-channel-map.md`](./generated/ipc-channel-map.md) | 生成物 | `pnpm gen:ipc-map` 由 `IpcChannel.ts` 生成，勿手工删行 |

## 归档

| 文档 | 原因 |
|---|---|
| [`archive/phase2-backend.md`](./archive/phase2-backend.md) | 早期 Phase 2 里程碑快照（2025-07-13），其中的 "Known gaps" 已被 `migration-plan.md §9` 取代，仅作历史留存 |

## 维护约定

- `migration-plan.md §5` 的 checkbox 是**计划**，实际进度以 `§9 当前执行状态` 为准，两者不一致时以 §9 为准。
- `feature-coverage.md` 的状态需在做过一项**运行路径验收**后再从 ⚠️ 升级为 ✅，并附证据（日志/DB/操作序列）。
- 生成物（`generated/`）不要手工编辑；改生成脚本后重新运行。
- 平台受限项（🚫）必须保留产品入口，不因未实现而从 UI/路由删除。
