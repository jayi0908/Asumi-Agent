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
| `scripts/spawn-dsh.mjs` | 占位服务 + 启动 DSH + 写出 `dist/dsh-url.json` |
| `scripts/fix-sharp-binary.mjs` | 修复 sharp@0.35.4 的 darwin-arm64 原生二进制（postinstall） |
| `vendor/sharp/sharp-darwin-arm64-0.35.4.tgz` | 修复用的预编译二进制（107K，vendored） |
| `src-tauri/src/lib.rs` | `setup` 中轮询 DSH URL 并导航 webview |
| `src-tauri/tauri.conf.json` | `devUrl: http://127.0.0.1:9999/`、`beforeDevCommand: spawn-dsh.mjs` |
| `src-tauri/capabilities/default.json` | 仅 `main` 窗口 + 基础权限 |

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

## 已知事项

- DSH 为 developer preview（当前 `0.1.5-rc.1`），升级需重新验证 profile 兼容性。
- Cherry 后端（`spawn_backend_loop`）目前仍并行启动，属过渡状态；后续可移除。
- `attachment-local` 依赖 sharp，因此 sharp 修复是 web client 可用的前提。
