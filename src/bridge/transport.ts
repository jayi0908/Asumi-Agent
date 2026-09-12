/**
 * Renderer transport replacing Electron ipcRenderer in window.api.
 *
 * AUTO-DETECTS runtime:
 *   - Tauri WebView → tauri invoke / listen
 *   - Browser (Chrome DevTools) → HTTP POST + SSE to backend hub
 *
 * NOTE: tauri APIs are imported statically on purpose. A dynamic
 * `import('@tauri-apps/api/core')` issued mid-graph (the very first invoke
 * from the boot marker) deadlocks WKWebView's module loader and silently
 * halts all further evaluation. Static imports are part of the initial
 * burst and are safe; the runtime guard below decides whether they are used.
 */

import { invoke as invokeTauri } from '@tauri-apps/api/core'
import { listen as listenTauri } from '@tauri-apps/api/event'

type Handler = (event: unknown, ...args: unknown[]) => void

// ---- Tauri backend ----
let tauriOK = false
let tauriPromise: Promise<boolean> | null = null

function isTauriRuntime(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function loadTauri(): Promise<boolean> {
  if (tauriOK) return true
  if (!isTauriRuntime()) return false
  if (tauriPromise) return tauriPromise
  tauriPromise = (async () => {
    tauriOK = true
    return true
  })()
  return tauriPromise
}

// ---- Browser fallback: HTTP POST / SSE ----
const browserListeners = new Map<string, Set<Handler>>()
let sseReady = false

function getHttpPort(): number {
  // prefer window global set by HTML
  const fromWindow = (window as any).__CHERRY_HTTP_PORT
  if (typeof fromWindow === 'number' && fromWindow > 0) return fromWindow
  // try static config file
  try {
    const p = (window as any).__CHERRY_BACKEND_PORT
    if (typeof p === 'number' && p > 0) return p
  } catch {}
  return 38887 // fallback
}

async function httpInvoke(channel: string, args: unknown[]): Promise<unknown> {
  const rsp = await fetch(`http://127.0.0.1:${getHttpPort()}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: `h${Date.now()}`, channel, args })
  })
  if (!rsp.ok) {
    const err = await rsp.json().catch(() => ({ error: { message: rsp.statusText } }))
    throw new Error(err.error?.message || 'http invoke failed')
  }
  const data = await rsp.json()
  if (data.type === 'error') throw new Error(data.error?.message || 'backend error')
  return data.result
}

async function httpSend(channel: string, args: unknown[]): Promise<void> {
  await fetch(`http://127.0.0.1:${getHttpPort()}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, args })
  })
}

function initSSE(): void {
  if (sseReady) return
  sseReady = true
  const es = new EventSource(`http://127.0.0.1:${getHttpPort()}/events`)
  es.onmessage = (event) => {
    let msg: any
    try { msg = JSON.parse(event.data) } catch { return }
    if (msg.type === 'event') {
      const set = browserListeners.get(msg.channel)
      if (!set) return
      for (const h of set) {
        try { h({}, ...(msg.args ?? [])) } catch {}
      }
    }
  }
  es.onerror = () => { /* reconnect automatically */ }
}

// ---- Unified API ----
export const ipcRenderer = {
  invoke: async (channel: string, ...args: unknown[]) => {
    if (isTauriRuntime()) {
      if (await loadTauri()) {
        return invokeTauri('backend_invoke', { payload: { channel, args } })
      }
    }
    // Browser mode: handle window management locally
    if (channel === 'settings-window:open' || channel === 'WindowManager_Open') {
      const kind = args[0]
      if (kind === 'settings' || channel === 'settings-window:open') {
        window.open('/windows/settings/index.html', 'cherry-settings', 'width=1000,height=700')
        return 'settings-window-opened'
      }
      return null
    }
    if (channel === 'WindowManager_Close' || channel === 'WindowManager_Minimize') {
      return null
    }
    if (channel === 'WindowManager_IsMaximized' || channel === 'WindowManager_IsFullScreen') {
      return false
    }
    if (channel === 'WindowManager_GetInitData') {
      return null
    }
    return httpInvoke(channel, args)
  },
  on: (channel: string, listener: Handler) => {
    if (isTauriRuntime()) {
      let unsub: any = () => {}
      void loadTauri().then((ok) => {
        if (!ok) {
          // dynamic import failed — fall back to SSE registration
          installBrowserListener(channel, listener)
          return
        }
        listenTauri('backend://event', (e: any) => {
          const p = e.payload as { channel: string; args: unknown[] }
          if (p && p.channel === channel) listener({}, ...(p.args ?? []))
        }).then((u: any) => { unsub = u })
      })
      return () => { try { unsub?.() } catch {} }
    }
    initSSE()
    return installBrowserListener(channel, listener)
  },
  off: (channel: string, listener: Handler) => {
    browserListeners.get(channel)?.delete(listener)
  },
  removeListener: (channel: string, listener: Handler) => {
    browserListeners.get(channel)?.delete(listener)
  },
  send: (channel: string, ...args: unknown[]) => {
    if (isTauriRuntime()) {
      void loadTauri().then((ok) => {
        if (ok) invokeTauri('backend_send', { payload: { channel, args } }).catch(() => {})
        else httpSend(channel, args).catch(() => {})
      })
    } else {
      httpSend(channel, args).catch(() => {})
    }
  }
}

function installBrowserListener(channel: string, listener: Handler): () => void {
  let set = browserListeners.get(channel)
  if (!set) { set = new Set(); browserListeners.set(channel, set) }
  set.add(listener)
  return () => { set?.delete(listener) }
}

export const shell = {
  openExternal: async (url: string) => {
    if (await loadTauri()) {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      return openUrl(url)
    }
    window.open(url, '_blank')
  }
}

export const webUtils = {
  getPathForFile: (file: { path?: string; name?: string }) => file?.path || file?.name || ''
}
