# DSH Spike 验证报告

> 日期：2026-09-15
> 分支：`feat/dsh-engine`
> 目的：验证 `@deepseek-ai/dsh`（Cordis + Harness）能否作为 Asumi Agent 的插件化引擎，运行在 Tauri 桌面壳之下。

---

## 验证结论（一句话）

**DSH 可以作为 Asumi Agent 的引擎** —— Cordis 插件框架、bundle/profile 组合机制、web client 均可正常工作；Tauri 壳只需改为 spawn DSH 子进程即可替代当前的 Cherry Node 后端。

---

## ① 引擎冒烟

```bash
cd /tmp/dsh-spike
pnpm add @deepseek-ai/dsh@0.1.5-rc.1
pnpm dsh web --no-open
# 输出: http://127.0.0.1:3080/?token=<token>
```

| 结果 | 说明 |
|---|---|
| ✅ 端口 3080 监听 | `lsof -i:3080` 确认 |
| ✅ HTTP 响应 | `curl http://127.0.0.1:3080` 返回 web UI（需 token 认证） |
| ✅ Node 子进程可被外部监督 | 标准 Node 进程，进程组可管理 |
| ⚠️ token 认证 | web client 需带 token 的 URL 才能渲染；浏览器打开完整 URL 即可 |

## ② Cordis 插件冒烟

```typescript
// scratch/hello-plugin/src/my-plugin.ts
import type { Context } from '@deepseek-ai/cordis'
export const name = 'my-plugin'
export function apply(ctx: Context) {
  console.log('[hello-plugin] plugin loaded!')
  ctx.effect(() => {
    console.log('[hello-plugin] effect registered')
    return () => console.log('[hello-plugin] effect cleaned up')
  })
}
```

```yaml
# scratch/hello-plugin/cordis.yml
- insert:
    - id: hello
      name: '/path/to/my-plugin.ts'
```

```bash
pnpm dsh --profile web --patch ./scratch/hello-plugin/cordis.yml --no-open
```

| 结果 | 日志 |
|---|---|
| ✅ `apply(ctx)` 执行 | `[hello-plugin] plugin loaded!` |
| ✅ `ctx.effect()` 注册 | `[hello-plugin] effect registered` |
| ✅ 卸载自动清理 | `[hello-plugin] effect cleaned up`（进程退出时） |
| ✅ TypeScript 源码直接加载 | DSH 用 tsx 动态加载 `.ts` |

## ③ Bundle / Profile 冒烟

### Bundle 结构（DSH 规范）

```
bundles/asumi-hello-bundle/
├── package.json          # { ..., "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } }
├── cordis.patch.yml      # - insert: [{ id, name: 'asumi-hello-bundle' }]
└── index.js              # export const name; export function apply(ctx)
```

### Profile 创建与 Bundle 安装

```bash
export DSH_HOME=/tmp/dsh-spike/dsh-home
pnpm dsh --profile asumi --from-default-profile web    # 创建 profile
pnpm dsh plugin --profile asumi add ./bundles/asumi-hello-bundle
```

### 安装后的 profile 清单

```json
{
  "name": "dsh-profile-asumi",
  "dependencies": {
    "asumi-hello-bundle": "link:..."
  },
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "asumi-hello-bundle"]
    }
  }
}
```

### 启动验证

```bash
pnpm dsh --profile asumi --no-open
# 日志:
# [asumi-hello-bundle] bundle plugin loaded! (from DSH profile)
# [asumi-hello-bundle] effect registered
```

| 结果 | 说明 |
|---|---|
| ✅ bundle 安装 | `dsh plugin add` 写入 dependencies + dsh.profile.bundles |
| ✅ profile 启动 | `dsh --profile asumi` 成功监听 3080 |
| ✅ bundle 插件加载 | bundle 的 `apply(ctx)` 被执行 |
| ✅ 多 bundle 共存 | `dsh-base` + `dsh-web-app` + `asumi-hello-bundle` 三层生效 |

---

## ④ Tauri 承载可行性

### 当前架构（Cherry 模式）

```
Tauri (Rust)
  └─ spawn_backend_loop → pnpm exec tsx src/backend/index.ts  (Cherry Node 后端)
      └─ devUrl → http://127.0.0.1:1420/windows/main/index.html  (Vite + Cherry 渲染)
```

### 目标架构（DSH 模式）

```
Tauri (Rust)
  └─ spawn_backend_loop → pnpm exec dsh --profile asumi --no-open  (DSH 引擎)
      └─ devUrl → http://127.0.0.1:3080/?token=...  (DSH web client)
```

### 现有可复用资产

| 资产 | 文件/模块 | 用途 |
|---|---|---|
| 进程 spawn/watchdog/respawn | `src-tauri/src/lib.rs` `spawn_backend_loop` | 改造后 spawn `dsh` |
| 进程组清理（SIGKILL/SIGTERM） | `src-tauri/src/lib.rs` `kill_backend_group` | 可照搬 |
| 子进程端口发现 | `BackendBridge` port 机制 | 改为读取 dsh 的 stdout（token URL） |
| App data 路径 | `resolveUserDataLocation` | 设 `$DSH_HOME` 到 Tauri app data |

### Phase 1 需改动

| 改动 | 说明 |
|---|---|
| `beforeDevCommand` | 改为 `dsh --profile asumi --no-open`（或 Tauri Rust 侧 spawn） |
| `devUrl` | 改为 `http://127.0.0.1:3080/?token=` + 动态 token（解析 stdout） |
| `capabilities/default.json` | 加 `core:webview:allow-navigate` + `http://127.0.0.1:3080` scope |
| `lib.rs` `spawn_backend_loop` | 改 spawn `dsh` 代替 tsx backend；解析 token；热重载支持 |
| `package.json` | 加 `@deepseek-ai/dsh` 依赖（固定版本 `0.1.5-rc.1`） |

---

## 已知事项

- DSH 为 **developer preview**（v0.1.5-rc.1），明确会有破坏性变更。建议固定精确版本，用 bridge 隔离。
- DSH web client 需要 **token 认证**才能渲染。Tauri webview 需加载完整 token URL 或通过 cookie 认证。
- `DEESPEAK_API_KEY` 不是 web UI 启动的必要条件（无 key 也可打开 UI；需要真实模型调用时才需要）。
- `@deepseek-ai/dsh-*` 子包均已独立发布到 npm（rc），可选择性依赖而非整体 `dsh`。
- `dsh-skill`、`dsh-persona` 等与 Asumi 直接相关的能力包已存在，后续直接复用。

---

## Phase 1 建议启动步骤

1. 将 `@deepseek-ai/dsh` 加入 `devDependencies`（固定 `0.1.5-rc.1`）
2. 在 `lib.rs` 中新增 `spawn_dsh_loop`（复制 `spawn_backend_loop`，改命令为 `dsh --profile asumi --no-open`）
3. 动态解析 stdout 提取 token，传给 `devUrl`
4. 更新 capabilities 允许 navigate 到 `http://127.0.0.1:3080`
5. 用 `pnpm dsh --profile asumi --from-default-profile web` 初始化 profile
6. 验证 Tauri 窗口加载 DSH web client 并完成流式对话
