> **已归档（Archived）** — 本文为 2025-07-13 的 Phase 2 里程碑快照。
> 其“Known gaps”已被 [`../migration-plan.md`](../migration-plan.md) §9「当前执行状态」取代，**内容可能已过时**，仅作历史留存。
> 当前功能可行性以 [`../feature-coverage.md`](../feature-coverage.md) 为准。

# Phase 2: Backend + Bridge — DONE

```
pnpm install    # full install
pnpm dev        # tauri + vite renderer + cherry backend
```

## What works
- Cherry lifecycle: 52 services bootstrap, DB migrations/seeds run, DataApi routing online
- electron-shim: 100+ Electron APIs (ipcMain, app, BrowserWindow, dialog, etc.)
- IPC hub: TCP JSON lines → Rust relay → Tauri events
- window.api: full facade generated from Cherry preload (line count match)
- lodash-esm-bridge: all 170+ subpaths
- Node loaders: `__dirname`/`require`/`import.meta.env`/assets/workspace aliases

## Platform layers (no product code changed)
| Layer | Files |
|---|---|
| electron-shim | `packages/electron-shim/src/index.ts` (~600 lines) |
| Node loaders | `scripts/register-asset-loader.mjs`, `asset-loader.mjs`, `import-meta-env-loader.mjs`, `workspace-alias-loader.mjs` |
| Backend entry | `src/backend/index.ts`, `ipc-hub.ts`, `start-cherry-main.ts` |
| Renderer bridge | `src/bridge/transport.ts`, `install.ts`, `window-api.generated.ts` |
| Tauri shell | `src-tauri/src/lib.rs` |
| lodash ESM | `packages/lodash-esm-bridge/` |
| symlinks | `src/main/migrations` → `../../migrations`, `src/main/packages` → `../../packages` |

## Known gaps
- registerIpc partial: legacy handlers with BrowserWindow deps will be resolved as services port
- Renderer JS errors: expected initially (bridge may need per-channel tuning)
- No UI modification done — Cherry renderer loads as-is
