import { IpcChannel } from '@shared/IpcChannel'
import { installGeneratedWindowApi } from './window-api.generated'
import { ipcRenderer } from './transport'

/** Fall back if generation has not run yet */
try {
  installGeneratedWindowApi()
} catch (error) {
  console.error('[bridge] failed to install window.api', error)
  throw error
}

// Cherry's renderer calls `window.electron.ipcRenderer.*` directly in many
// places (logger, tabs, theme, mcp, notifications...). Electron's preload
// exposed `electronAPI` from @electron-toolkit/preload; we replicate the
// surface the renderer actually touches, backed by the same transport.
type Listener = (event: unknown, ...args: unknown[]) => void

function detectPlatform(): string {
  const ua = navigator.userAgent
  if (/Mac/i.test(ua)) return 'darwin'
  if (/Win/i.test(ua)) return 'win32'
  return 'linux'
}

function installElectronShim(): void {
  const activeUnsubs = new Map<string, Set<() => void>>()

  const electron = {
    ipcRenderer: {
      invoke: ipcRenderer.invoke,
      send: ipcRenderer.send,
      on: (channel: string, listener: Listener) => {
        const unsub = ipcRenderer.on(channel, listener)
        let set = activeUnsubs.get(channel)
        if (!set) { set = new Set(); activeUnsubs.set(channel, set) }
        set.add(unsub)
        return unsub
      },
      once: (channel: string, listener: Listener) => {
        const wrapped: Listener = (event, ...args) => {
          ipcRenderer.off(channel, wrapped)
          listener(event, ...args)
        }
        return ipcRenderer.on(channel, wrapped)
      },
      off: (channel: string, listener: Listener) => ipcRenderer.off(channel, listener),
      removeListener: (channel: string, listener: Listener) => ipcRenderer.removeListener(channel, listener),
      removeAllListeners: (channel?: string) => {
        const channels = channel ? [channel] : [...activeUnsubs.keys()]
        for (const ch of channels) {
          const set = activeUnsubs.get(ch)
          if (!set) continue
          for (const unsub of set) { try { unsub() } catch {} }
          activeUnsubs.delete(ch)
        }
      }
    },
    process: {
      platform: detectPlatform(),
      env: {
        NODE_ENV: import.meta.env.DEV ? 'development' : 'production'
      }
    }
  }

  // The generated window-api already defines `window.electron` as non-writable;
  // re-define it with the richer shim (configurable:true permits redefinition).
  Object.defineProperty(window, 'electron', {
    value: electron,
    writable: false,
    configurable: true
  })
}

// Forward uncaught renderer errors into Cherry's main-process logger so they
// land in the app log files (same channel the renderer LoggerService uses).
function windowNameOf(): string {
  return (window as unknown as { name?: string }).name || 'main'
}

// Boot marker: proves the bridge installed and the renderer can reach the
// main-process logger through the transport (warn level to bypass filters).
void ipcRenderer
  .invoke(
    IpcChannel.App_LogToMain,
    { process: 'renderer', window: windowNameOf(), module: 'bridge' },
    'warn',
    '[bridge] installed',
    []
  )
  .catch(() => {})

function forwardRuntimeErrors(): void {
  const windowName = windowNameOf()
  const log = (level: string, message: string, stack?: unknown) => {
    void ipcRenderer
      .invoke(IpcChannel.App_LogToMain, { process: 'renderer', window: windowName, module: 'runtime' }, level, message, [stack])
      .catch(() => {})
  }
  window.addEventListener('error', (e) => {
    const err = e.error
    log('error', e.message, err instanceof Error ? err.stack : String(err ?? ''))
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    log('error', reason instanceof Error ? reason.message : String(reason), reason?.stack)
  })
}

installElectronShim()
forwardRuntimeErrors()
