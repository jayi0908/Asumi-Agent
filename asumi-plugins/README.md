# Asumi 插件工作区

Asumi Agent 的自有能力以 **DSH bundle**（Cordis 插件 + `cordis.patch.yml` 层）形式实现。
每个插件都能独立安装，也能装进原版 DSH。

## 目录约定

```
asumi-plugins/
└── asumi-<name>/
    ├── package.json       # type:module, main, files, dsh.bundle.patch
    ├── cordis.patch.yml   # 该 bundle 的配置层（覆盖/插入插件行）
    ├── index.js           # export const name / inject / apply(ctx)
    └── <assets>           # 该插件的数据文件（如 persona.md）
```

## 现有插件

| 插件 | 作用 | 状态 |
|---|---|---|
| `asumi-persona` | 錦 あすみ 的人设（system prompt 段）+ `asumi_name` 变量 | ✅ |
| `asumi-desktop` | 桌面桥：`ctx.asumiDesktop`（`say` / `setPetState` / `setPetMode` / `playAudio` / `notify` / `captureScreen`）+ 工具 `asumi_say` / `asumi_presence` / `asumi_look`；监听 `127.0.0.1:${ASUMI_DESKTOP_PORT:-3099}`（端口由壳分配）供 Tauri 连接 | ✅ |
| `asumi-fallback` | 自建的 route 探测不通时，把这一次请求改走用户提名的兜底（`agent/request` 瀑布） | ✅ |
| `asumi-regenerate` | 纯客户端插件：回答操作条上的「重新生成」（从提问处 fork 后重问，旧回答留在原会话） | ✅ |

## 安装到 profile

```bash
export DSH_HOME="$HOME/Library/Application Support/AsumiAgent"
pnpm dsh plugin --profile asumi add ./asumi-plugins/<plugin-dir>
```

安装后 `dsh plugin` 会把包写进 `$DSH_HOME/profiles/asumi/package.json` 的
`dependencies` 与 `dsh.profile.bundles`。

## 验证

```bash
# 层是否生效
pnpm dsh --profile asumi --dump-config | rg -A3 "asumi-plugin-<name>"

# 插件是否挂载
pnpm dsh --profile asumi --no-open 2>&1 | rg "asumi-"
```

## 编写新插件的要点

- 插件是 `apply(ctx)` 函数；`inject` 声明依赖的服务，DSH 保证依赖就绪后才调用。
- 通过 `ctx` 的注册（`ctx.effect` / `ctx.on` / `ctx.tools.register` / `ctx.systemPrompt.section`…）
  在卸载时自动回滚，不要手写清理逻辑。
- 可导入宿主包：`@deepseek-ai/cordis`（`Service`）、`@deepseek-ai/dsh-tools`（`defineTool`）等。
  这些包由 `scripts/link-dsh-packages.mjs`（postinstall）软链到 `asumi-plugins/node_modules`。
- 需要跨插件共享数据时，优先用服务键（`ctx.<name>`）或 prompt 变量（`ctx.systemPrompt.variable`）。
```

