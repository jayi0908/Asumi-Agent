# docs 目录索引

Asumi Agent 是以 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）
为引擎、以 Tauri 2 为桌面宿主的 AI 伴侣应用。本目录记录它自己的设计与验证。

> Cherry Studio（Electron → Tauri 移植）的代码**不在本分支**，只保留在 `migration-plan`
> 分支上供参考与迁移。与之相关的文档收在 [`reference/`](./reference) 下。

## 文档地图

| 文档 | 性质 | 说明 |
|---|---|---|
| [`dsh-engine.md`](./dsh-engine.md) | **架构与验证（持续更新）** | 引擎接入、模型、桌面桥、桌宠、屏幕理解、快捷呼出、打包的实现与实测结果 |
| [`dsh-spike.md`](./dsh-spike.md) | 历史报告 | Phase 0 结论：DSH 能否作为本应用的引擎 |

## 参考（Cherry Studio 移植）

这些文档描述 `migration-plan` 分支上的 Cherry 移植工作，本分支已不包含其代码。

| 文档 | 说明 |
|---|---|
| [`reference/feature-coverage.md`](./reference/feature-coverage.md) | Cherry Studio 官方文档逐项核查 |
| [`reference/migration-plan.md`](./reference/migration-plan.md) | 移植总计划与执行状态 |
| [`reference/migration-source-map.md`](./reference/migration-source-map.md) | 文件级对照与状态 |
| [`reference/CHERRY_BASELINE`](./reference/CHERRY_BASELINE) | 对照的 Cherry 上游 commit |
| [`reference/generated/ipc-channel-map.md`](./reference/generated/ipc-channel-map.md) | Cherry IPC 通道生成物 |
| [`reference/archive/phase2-backend.md`](./reference/archive/phase2-backend.md) | 早期里程碑快照 |

## 维护约定

- `dsh-engine.md` 的验证表只在做过一次**真实运行路径验收**后更新，并附证据（日志 / API / 操作序列）。
- 引擎固定精确版本（`@deepseek-ai/dsh@0.1.5-rc.1`）：DSH 是 developer preview，升级后需重新跑一遍验证表。
- 桌面能力一律以 **DSH 插件（`asumi-plugins/*`）** 实现；Tauri 壳只做插件做不了的事（窗口、桥、系统集成）。
