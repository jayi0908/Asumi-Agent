/**
 * Electron API shim for running Cherry `src/main` under Tauri + Node.
 * Goal: keep Cherry service code unchanged; only the host process differs.
 *
 * Handlers registered via `ipcMain.handle` are reachable through
 * `invokeIpc(channel, ...args)` used by the backend IPC hub.
 */

import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown | Promise<unknown>
type EventHandler = (event: IpcMainEvent, ...args: unknown[]) => void

export interface IpcMainInvokeEvent {
  processId: number
  frameId: number
  sender: WebContentsLike
}

export interface IpcMainEvent {
  processId: number
  frameId: number
  sender: WebContentsLike
  returnValue?: unknown
}

export interface WebContentsLike {
  id: number
  send: (channel: string, ...args: unknown[]) => void
  setWindowOpenHandler: (handler: (details: { url: string }) => { action: string } | void) => void
  isDestroyed: () => boolean
  session?: {
    setSpellCheckerEnabled?: (enabled: boolean) => void
    setSpellCheckerLanguages?: (languages: string[]) => void
    flushStorageData?: () => void
    closeAllConnections?: () => Promise<void>
    cookies?: { flushStore?: () => Promise<void> }
    webRequest?: { onHeadersReceived?: (filters: unknown, listener: unknown) => void }
  }
  executeJavaScript?: (code: string) => Promise<unknown>
  printToPDF?: () => Promise<Buffer>
}

const invokeHandlers = new Map<string, InvokeHandler>()
const eventBus = new EventEmitter()
eventBus.setMaxListeners(0)

const pushTargets = new Set<(channel: string, args: unknown[]) => void>()

export function registerPushTarget(fn: (channel: string, args: unknown[]) => void): () => void {
  pushTargets.add(fn)
  return () => pushTargets.delete(fn)
}

// System-API bridge: routes native primitives (dialog/shell/clipboard) to the
// Tauri shell over the IPC hub. Registered by `src/backend/ipc-hub.ts` at boot.
type SystemBridge = (channel: string, args: unknown[]) => Promise<unknown>
let systemBridge: SystemBridge | null = null

export function registerSystemBridge(fn: SystemBridge): () => void {
  systemBridge = fn
  return () => {
    if (systemBridge === fn) systemBridge = null
  }
}

async function sys(channel: string, args: unknown[]): Promise<unknown> {
  if (systemBridge) return systemBridge(channel, args)
  throw new Error(`[electron-shim] system bridge not registered (${channel})`)
}

function emitPush(channel: string, args: unknown[]): void {
  for (const fn of pushTargets) {
    try {
      fn(channel, args)
    } catch {
      /* ignore push errors */
    }
  }
}

// In Tauri mode windows are owned by the Rust shell, so webContents is an
// inert EventEmitter: Cherry's window services can register listeners and push
// events (which fan out to renderers via the hub) but no real page loads occur.
class ShimWebContents extends EventEmitter {
  id = 1
  session = {
    setSpellCheckerLanguages: (_langs: string[]) => {},
    flushStorageData: () => {},
    closeAllConnections: async () => {},
    cookies: { flushStore: async () => {} },
    webRequest: { onHeadersReceived: (_filters: unknown, _listener: unknown) => {} }
  }

  send(channel: string, ...args: unknown[]): void {
    emitPush(channel, args)
  }

  setWindowOpenHandler(_handler: (details: { url: string }) => { action: string } | void): void {}

  isDestroyed(): boolean {
    return false
  }

  getURL = (): string => ''
  getTitle = (): string => 'Cherry Studio'
  userAgent = 'Mozilla/5.0 (compatible; CherryStudioTauri)'
  devToolsWebContents: ShimWebContents | null = null
  printToPDF = async (): Promise<Buffer> => Buffer.alloc(0)
  debugger = {
    isAttached: () => false,
    attach: async () => {},
    detach: async () => {},
    sendCommand: async () => undefined
  }
  executeJavaScript = async (_code: string): Promise<unknown> => undefined
  loadURL = async (_url: string) => {}
  loadFile = async (_file: string) => {}
  reload = () => {}
  goBack = () => {}
  goForward = () => {}
  canGoBack = () => false
  canGoForward = () => false
  isLoading = () => false
  isCrashed = () => false
  setZoomFactor = (_factor: number) => {}
  setUserAgent = (_ua: string) => {}
  sendInputEvent = (_event: unknown) => {}
  toggleDevTools = () => {}
  openDevTools = () => {}
  forcefullyCrashRenderer = () => {}
  close = () => {}
  destroy = () => {}
}

const sender = new ShimWebContents()

function makeInvokeEvent(): IpcMainInvokeEvent {
  return { processId: process.pid, frameId: 0, sender }
}

function makeEvent(): IpcMainEvent {
  return { processId: process.pid, frameId: 0, sender }
}

export async function invokeIpc(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = invokeHandlers.get(channel)
  if (!handler) {
    throw new Error(`[electron-shim] No handler registered for channel: ${channel}`)
  }
  return handler(makeInvokeEvent(), ...args)
}

// Fire-and-forget delivery to `ipcMain.on` listeners (renderer `ipcRenderer.send`).
// Unlike invokeIpc (which resolves `ipcMain.handle`), this emits on the event bus
// so `on`-style channels (e.g. `cache:sync`) reach their handlers without requiring
// a response. No-op if nothing is listening (mirrors Electron's silent drop).
export function emitIpc(channel: string, ...args: unknown[]): void {
  eventBus.emit(channel, makeEvent(), ...args)
}

export const ipcMain = {
  handle(channel: string, listener: InvokeHandler): void {
    invokeHandlers.set(channel, listener)
  },
  removeHandler(channel: string): void {
    invokeHandlers.delete(channel)
  },
  on(channel: string, listener: EventHandler): void {
    eventBus.on(channel, listener)
  },
  once(channel: string, listener: EventHandler): void {
    eventBus.once(channel, listener)
  },
  removeListener(channel: string, listener: EventHandler): void {
    eventBus.removeListener(channel, listener)
  },
  removeAllListeners(channel?: string): void {
    if (channel) eventBus.removeAllListeners(channel)
    else eventBus.removeAllListeners()
  },
  emit(channel: string, ...args: unknown[]): boolean {
    return eventBus.emit(channel, makeEvent(), ...args)
  },
  listenerCount(channel: string): number {
    return eventBus.listenerCount(channel)
  }
}

// Main-process Electron does not expose ipcRenderer. Leave undefined so packages
// like electron-store take the main-process branch (ipcMain + app).
export const ipcRenderer: undefined = undefined


const pathMap = new Map<string, string>()

function defaultUserData(): string {
  const home = os.homedir()
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'CherryStudio-Tauri')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'CherryStudio-Tauri')
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'CherryStudio-Tauri')
}

function ensurePath(p: string): string {
  fs.mkdirSync(p, { recursive: true })
  return p
}

const appEvents = new EventEmitter()
let ready = false
let quitting = false

function initPaths(): void {
  const userData = process.env.CHERRY_USER_DATA || defaultUserData()
  pathMap.set('home', os.homedir())
  pathMap.set('appData', path.dirname(userData))
  pathMap.set('userData', ensurePath(userData))
  pathMap.set('sessionData', ensurePath(path.join(userData, 'Session')))
  pathMap.set('temp', ensurePath(path.join(os.tmpdir(), 'cherry-studio-tauri')))
  pathMap.set('exe', process.execPath)
  pathMap.set('module', process.cwd())
  pathMap.set('desktop', path.join(os.homedir(), 'Desktop'))
  pathMap.set('documents', path.join(os.homedir(), 'Documents'))
  pathMap.set('downloads', path.join(os.homedir(), 'Downloads'))
  pathMap.set('music', path.join(os.homedir(), 'Music'))
  pathMap.set('pictures', path.join(os.homedir(), 'Pictures'))
  pathMap.set('videos', path.join(os.homedir(), 'Videos'))
  pathMap.set('logs', ensurePath(path.join(userData, 'logs')))
  pathMap.set('crashDumps', ensurePath(path.join(userData, 'Crashpad')))
}

initPaths()

export const app = {
  getName: () => 'Cherry Studio',
  getVersion: () => process.env.CHERRY_VERSION || '2.0.0-dev',
  getLocale: () => Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
  getLocaleCountryCode: () => '',
  isPackaged: false,
  isReady: () => ready,
  whenReady: () => {
    if (!ready) {
      ready = true
      queueMicrotask(() => appEvents.emit('ready'))
    }
    return Promise.resolve()
  },
  getPath: (name: string) => {
    const p = pathMap.get(name)
    if (!p) throw new Error(`[electron-shim] Unknown path: ${name}`)
    return p
  },
  setPath: (name: string, p: string) => {
    pathMap.set(name, name === 'userData' || name === 'logs' ? ensurePath(p) : p)
  },
  getAppPath: () => process.cwd(),
  quit: () => {
    if (process.env.CHERRY_IPC_PORT) {
      console.warn('[electron-shim] app.quit() called — backend stays alive')
      return
    }
    quitting = true
    appEvents.emit('before-quit', new Event('before-quit'))
    process.exit(0)
  },
  exit: (code = 0) => {
    // In Tauri backend mode, exit is relayed to Rust host shell, not Node process.
    if (process.env.CHERRY_IPC_PORT) {
      console.warn('[electron-shim] app.exit() called — backend stays alive')
      return
    }
    process.exit(code)
  },
  relaunch: (_options?: { args?: string[]; execPath?: string }) => {
    process.exit(0)
  },
  focus: () => {},
  hide: () => {},
  show: () => {},
  dock: {
    hide: async () => {},
    show: async () => {},
    setIcon: () => {},
    setMenu: () => {},
    bounce: () => 0,
    cancelBounce: () => {},
    setBadge: () => {},
    getBadge: () => ''
  },
  requestSingleInstanceLock: () => true,
  releaseSingleInstanceLock: () => {},
  setAppUserModelId: (_id: string) => {},
  setLoginItemSettings: () => {},
  getLoginItemSettings: () => ({ openAtLogin: false, openAsHidden: false, wasOpenedAtLogin: false, wasOpenedAsHidden: false, restoreState: false }),
  isDefaultProtocolClient: () => false,
  setAsDefaultProtocolClient: () => false,
  removeAsDefaultProtocolClient: () => false,
  getGPUFeatureStatus: () => ({}),
  disableHardwareAcceleration: () => {},
  commandLine: {
    appendSwitch: () => {},
    appendArgument: () => {},
    hasSwitch: () => false,
    getSwitchValue: () => ''
  },
  on: (event: string, listener: (...args: unknown[]) => void) => {
    appEvents.on(event, listener)
    return app
  },
  once: (event: string, listener: (...args: unknown[]) => void) => {
    appEvents.once(event, listener)
    return app
  },
  off: (event: string, listener: (...args: unknown[]) => void) => {
    appEvents.off(event, listener)
    return app
  },
  removeListener: (event: string, listener: (...args: unknown[]) => void) => {
    appEvents.removeListener(event, listener)
    return app
  },
  emit: (event: string, ...args: unknown[]) => appEvents.emit(event, ...args),
  isQuitting: () => quitting
}

// Shim BrowserWindow instances that map to a real Tauri WebviewWindow, keyed by
// instance id. Reverse window events (focus/blur) are dispatched to these.
const tauriWindows = new Map<number, BrowserWindow>()

// Map a loadURL/loadFile source (dev-server URL or absolute file path) to a
// Tauri window label + app URL path. The source always contains a
// `/windows/<...>/index.html` segment matching Cherry's window entries.
// The lazy group must stop exactly before `/index.html` — a looser tail
// anchor would capture only the first path segment (e.g. "selection") and
// make selection/action collide with selection/toolbar on one label.
function resolveWindowRoute(source: string): { label: string; appPath: string } | null {
  const m = source.match(/\/windows\/(.+?)(?:\/index)?\.html(?:\?|#|\/|$)/)
  if (!m) return null
  const rel = m[1]
  const appPath = `/windows/${rel}/index.html`
  const seg = rel.split('/')
  let label = seg[0]
  if (seg[0] === 'selection') label = seg[1] === 'action' ? 'selectionAction' : 'selectionToolbar'
  return { label, appPath }
}

// ─── Reverse global-shortcut dispatch ────────────────────────────────
// The Tauri shell registers OS-level shortcuts (via `sys('shortcut.register')`)
// and pushes `shortcut-press` messages back; the ipc-hub calls this to invoke
// the JS callback Cherry registered for that accelerator.
const shortcutCallbacks = new Map<string, () => void>()

export function dispatchShortcutPress(accelerator: string): void {
  const cb = shortcutCallbacks.get(accelerator)
  if (cb) {
    try { cb() } catch { /* swallowed to keep the backend alive */ }
  }
}

// Reverse window focus/blur from the Rust shell (via `on_window_event`).
// Cherry services key their behavior on these (ShortcutService re-registration,
// QuickAssistantService auto-hide, MainWindowService show/hide).
export function dispatchWindowFocus(label: string, focused: boolean): void {
  for (const win of tauriWindows.values()) {
    if (win.tRoute?.label !== label) continue
    win.tFocused = focused
    win.emit(focused ? 'focus' : 'blur')
  }
}

export class BrowserWindow extends EventEmitter {
  // In Tauri mode windows are owned by the Rust shell; there is exactly one
  // virtual window whose `webContents.send` fans out to every renderer via the
  // hub (see `ShimWebContents.send` → `emitPush`). Services that enumerate
  // windows to broadcast (e.g. CacheService) rely on this being non-empty.
  static virtualWindow: BrowserWindow | null = null
  static getAllWindows(): BrowserWindow[] {
    if (!BrowserWindow.virtualWindow) {
      const vw = new BrowserWindow()
      vw.id = 1
      vw.webContents = sender
      BrowserWindow.virtualWindow = vw
    }
    return [BrowserWindow.virtualWindow]
  }
  static getFocusedWindow(): BrowserWindow | null {
    return BrowserWindow.virtualWindow
  }
  static fromId(_id: number): BrowserWindow | null {
    return BrowserWindow.virtualWindow
  }
  static fromWebContents(_wc: unknown): BrowserWindow | null {
    return null
  }

  id = Math.floor(Math.random() * 1e6)
  webContents: ShimWebContents
  // The real Tauri window this instance is backed by (label + app URL path),
  // resolved when loadURL/loadFile is called. `null` until then (e.g. the
  // virtual broadcast window is never loadURL'd and never creates a window).
  // Internal Tauri routing state (prefixed `t`), shared with the dispatchers
  // below via direct access.
  tRoute: { label: string; appPath: string } | null = null
  tOpts: Record<string, unknown> = {}
  tVisible = false
  tFocused = false
  tDestroyed = false

  constructor(options?: Record<string, unknown>) {
    super()
    this.webContents = new ShimWebContents()
    this.tOpts = options || {}
    this.tVisible = options?.show === true
  }

  private sysW(method: string, args: unknown[] = []): void {
    if (!this.tRoute) return
    void sys(method, [this.tRoute.label, ...args]).catch(() => { /* window may be closed */ })
  }

  loadURL = async (url: string) => { this.routeFrom(url) }
  loadFile = async (file: string) => { this.routeFrom(file) }
  private routeFrom(source: string): void {
    const route = resolveWindowRoute(source)
    if (!route) { console.warn('[electron-shim] no window route for', source); return }
    this.tRoute = route
    tauriWindows.set(this.id, this)
    const opts = this.tOpts
    const visible = this.tVisible
    sys('window.create', [{
      label: route.label,
      appPath: route.appPath,
      width: (opts.width as number) ?? 800,
      height: (opts.height as number) ?? 600,
      alwaysOnTop: !!opts.alwaysOnTop,
      skipTaskbar: !!opts.skipTaskbar,
      frame: opts.frame !== false,
      center: !!opts.center,
      visible
    }]).then((res) => {
      console.log(`[electron-shim] window.create ${route.label} ->`, JSON.stringify(res))
      // If the creator passed explicit bounds, apply them after creation.
      if (typeof opts.x === 'number' && typeof opts.y === 'number') {
        void sys('window.set-position', [route.label, opts.x, opts.y]).catch(() => {})
      }
      // Approximate Chromium's ready-to-show so WindowManager's auto-show path
      // (and domain services awaiting it) progress.
      if (visible) this.emit('show')
      this.emit('ready-to-show')
    }).catch((e) => { console.warn('[electron-shim] window.create failed', route.label, e?.message || e) })
  }

  show = () => { this.tVisible = true; this.sysW('window.show'); this.emit('show') }
  showInactive = () => { this.show() }
  hide = () => { this.tVisible = false; this.sysW('window.hide'); this.emit('hide') }
  restore = () => { this.show() }
  reload = () => {}
  setMinimumSize = (_w: number, _h: number) => {}
  getNativeWindowHandle = (): Buffer => Buffer.alloc(0)
  close = () => { this.tVisible = false; this.sysW('window.close'); this.emit('close'); this.tDestroyed = true; this.emit('closed') }
  destroy = () => { this.close() }
  focus = () => { this.sysW('window.focus') }
  blur = () => { this.emit('blur') }
  isDestroyed = () => this.tDestroyed
  isVisible = () => this.tVisible
  isMinimized = () => false
  isMaximized = () => false
  isFullScreen = () => false
  minimize = () => { this.sysW('window.minimize') }
  maximize = () => {}
  unmaximize = () => {}
  setFullScreen = (_v: boolean) => {}
  setSize = (w: number, h: number) => { this.sysW('window.set-size', [w, h]) }
  getSize = () => [this.tOpts.width as number || 1200, this.tOpts.height as number || 800]
  setPosition = (x: number, y: number) => { this.sysW('window.set-position', [x, y]) }
  getPosition = () => [0, 0]
  setBounds = (_bounds?: { x?: number; y?: number; width?: number; height?: number }) => {
    if (_bounds?.x != null && _bounds?.y != null) this.sysW('window.set-position', [_bounds.x, _bounds.y])
  }
  getBounds = () => ({ x: 0, y: 0, width: this.tOpts.width as number || 1200, height: this.tOpts.height as number || 800 })
  setAlwaysOnTop = (v: boolean) => { this.sysW('window.set-always-on-top', [!!v]) }
  setSkipTaskbar = () => {}
  setIgnoreMouseEvents = () => {}
  setFocusable = () => {}
  setVisibleOnAllWorkspaces = () => {}
  setOpacity = () => {}
  center = () => {}
  setTitle = () => {}
  getTitle = () => 'Cherry Studio'
  flashFrame = () => {}
  setMenu = () => {}
  removeMenu = () => {}
  setClosable = () => {}
  setMinimizable = () => {}
  setContentBounds = () => {}
  getContentBounds = () => ({ x: 0, y: 0, width: 1200, height: 800 })
  getContentSize = () => [1200, 800]
  setContentSize = (_w: number, _h: number) => {}
  getOpacity = (): number => 1
  addBrowserView = () => {}
  removeBrowserView = () => {}
  isFocused = () => this.tFocused
  isFocusable = () => true
  setMaximizable = () => {}
  setResizable = () => {}
  setParentWindow = () => {}
}

export const dialog = {
  showOpenDialog: async (options: Record<string, unknown> = {}) => {
    try {
      return (await sys('dialog.open', [options])) as { canceled: boolean; filePaths: string[] }
    } catch (error) {
      console.error('[electron-shim] dialog.showOpenDialog', error)
      return { canceled: true, filePaths: [] as string[] }
    }
  },
  showSaveDialog: async (options: Record<string, unknown> = {}) => {
    try {
      return (await sys('dialog.save', [options])) as { canceled: boolean; filePath?: string }
    } catch (error) {
      console.error('[electron-shim] dialog.showSaveDialog', error)
      return { canceled: true }
    }
  },
  showMessageBox: async (options: {
    type?: string
    title?: string
    message?: string
    detail?: string
    buttons?: string[]
    defaultId?: number
    cancelId?: number
  }) => {
    try {
      return (await sys('dialog.showMessageBox', [options])) as {
        response: number
        checkboxChecked: boolean
      }
    } catch (error) {
      console.error('[electron-shim] dialog.showMessageBox', error)
      // Fallback: preserve the previous deterministic behavior (last button).
      const buttons = options?.buttons || []
      return { response: Math.max(0, buttons.length - 1), checkboxChecked: false }
    }
  },
  showErrorBox: (title: string, content: string) => {
    console.error('[electron-shim] dialog.showErrorBox', title, content)
  },
  showOpenDialogSync: () => [] as string[],
  showSaveDialogSync: () => undefined as string | undefined,
  showMessageBoxSync: (options: { title?: string; message?: string; detail?: string; buttons?: string[] }) => {
    console.error(
      '[electron-shim] dialog.showMessageBoxSync',
      options?.title,
      options?.message,
      options?.detail
    )
    const buttons = options?.buttons || []
    return Math.max(0, buttons.length - 1)
  }
}

export const shell = {
  openExternal: async (url: string) => {
    try {
      await sys('shell.openExternal', [url])
    } catch {
      emitPush('shell:open-external', [url])
    }
  },
  openPath: async (p: string) => {
    try {
      const errorMessage = (await sys('shell.openPath', [p])) as string
      return errorMessage || ''
    } catch {
      emitPush('shell:open-path', [p])
      return ''
    }
  },
  showItemInFolder: (p: string) => {
    void sys('shell.showItemInFolder', [p]).catch(() => {
      emitPush('shell:show-item', [p])
    })
  },
  trashItem: async () => {},
  beep: () => {},
  readShortcutLink: () => ({}),
  writeShortcutLink: () => false
}

export const clipboard = {
  readText: () => '',
  writeText: (_t: string) => {},
  readHTML: () => '',
  writeHTML: (_h: string) => {},
  clear: () => {},
  availableFormats: () => [] as string[]
}

// Electron's nativeTheme is an EventEmitter with a `themeSource` accessors.
// Setting themeSource forwards to the Tauri shell (app.set_theme); theme
// changes (incl. system switches) come back as `theme-changed` messages.
class ShimNativeTheme extends EventEmitter {
  private _themeSource = 'system'
  private _dark = false

  get themeSource(): string {
    return this._themeSource
  }

  set themeSource(source: string) {
    this._themeSource = source === 'dark' || source === 'light' ? source : 'system'
    void sys('theme.set', [this._themeSource]).catch(() => {})
  }

  get shouldUseDarkColors(): boolean {
    return this._dark
  }

  applyTheme(theme: string | null): void {
    if (theme === 'dark') this._dark = true
    else if (theme === 'light') this._dark = false
    this.emit('updated')
  }
}

export const nativeTheme = new ShimNativeTheme()

export const screen = {
  getPrimaryDisplay: () => ({
    id: 0,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    scaleFactor: 2,
    rotation: 0
  }),
  getAllDisplays: () => [screen.getPrimaryDisplay()],
  getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  getDisplayNearestPoint: () => screen.getPrimaryDisplay(),
  on: () => screen
}

// Tauri's global-hotkey parser accepts every Cherry shortcut token except the
// numpad-minus spelling `numsub` (it wants `numsubtract`). Normalize only the
// key token before crossing to the shell; the raw string stays the callback key
// so register/unregister/is-registered all agree with Cherry's bookkeeping.
function tauriAccelerator(accelerator: string): string {
  const parts = accelerator.split('+')
  const last = parts[parts.length - 1]
  if (typeof last === 'string' && /^numsub$/i.test(last)) parts[parts.length - 1] = 'numsubtract'
  return parts.join('+')
}

// Routes OS-level global shortcuts through the Tauri shell. Electron
// accelerator strings (e.g. `CmdOrCtrl+Shift+E`) are accepted by Tauri's
// parser unchanged, so the raw string is used as the stable callback key.
export const globalShortcut = {
  register: (accelerator: string, callback: () => void): boolean => {
    shortcutCallbacks.set(accelerator, callback)
    void sys('shortcut.register', [tauriAccelerator(accelerator)])
      .then((ok) => {
        if (ok === false) {
          console.warn(`[electron-shim] globalShortcut.register refused: ${accelerator}`)
          shortcutCallbacks.delete(accelerator)
        }
      })
      .catch((e) => {
        console.warn(`[electron-shim] globalShortcut.register ${accelerator}`, e?.message || e)
      })
    return true
  },
  unregister: (accelerator: string): void => {
    shortcutCallbacks.delete(accelerator)
    void sys('shortcut.unregister', [tauriAccelerator(accelerator)]).catch(() => {})
  },
  unregisterAll: (): void => {
    shortcutCallbacks.clear()
    void sys('shortcut.unregister-all', []).catch(() => {})
  },
  isRegistered: (accelerator: string): boolean => shortcutCallbacks.has(accelerator)
}

// ─── Tray + Menu (reverse-dispatched from the Tauri shell) ────────────
const trayInstances = new Set<Tray>()

export function dispatchTrayEvent(event: 'click' | 'right-click'): void {
  for (const tray of trayInstances) {
    try {
      tray.emit(event, makeEvent(), tray, { x: 0, y: 0, width: 22, height: 22 })
    } catch {
      /* keep the backend alive */
    }
  }
}

let menuItemSeq = 0
const menuItemCallbacks = new Map<string, () => void>()

function trayMenuItems(menu: unknown): Array<Record<string, unknown>> {
  if (!(menu instanceof Menu)) return []
  return menu._items.map((item) =>
    item.type === 'separator' ? { id: item.id, separator: true } : { id: item.id, label: item.label, type: 'item', enabled: item.enabled }
  )
}

export function dispatchTrayMenuClick(id: string): void {
  const cb = menuItemCallbacks.get(id)
  if (cb) {
    try {
      cb()
    } catch {
      /* keep the backend alive */
    }
  }
}

export interface TrayMenuItem {
  id: string
  label?: string
  type: 'item' | 'separator'
  enabled?: boolean
}

export class Menu {
  readonly _items: TrayMenuItem[]

  private constructor(items: TrayMenuItem[]) {
    this._items = items
  }

  static buildFromTemplate(template: unknown[]): Menu {
    const items: TrayMenuItem[] = []
    for (const raw of template) {
      const entry = raw as { label?: string; type?: string; enabled?: boolean; click?: () => void } | null
      if (!entry || typeof entry !== 'object') continue
      if (entry.type === 'separator') {
        items.push({ id: `mi_${menuItemSeq++}`, type: 'separator' })
        continue
      }
      if (entry.type === 'submenu') {
        console.warn('[electron-shim] submenu in menu template not supported; skipped')
        continue
      }
      const id = `mi_${menuItemSeq++}`
      items.push({ id, label: entry.label, type: 'item', enabled: entry.enabled !== false })
      if (typeof entry.click === 'function') menuItemCallbacks.set(id, entry.click)
    }
    return new Menu(items)
  }

  static setApplicationMenu = (_menu: unknown): void => {}
  static getApplicationMenu = (): Menu | null => null

  popup = (): void => {
    void sys('tray.menu-popup', []).catch(() => {})
  }
  closePopup = (): void => {}
  append = (): void => {}
  insert = (): void => {}
  getMenuItemById = (id: string): TrayMenuItem | null => this._items.find((i) => i.id === id) ?? null
}

export class Tray extends EventEmitter {
  constructor(image?: unknown) {
    super()
    trayInstances.add(this)
    const ref = imageRef(image)
    void sys('tray.create', [ref ? { icon: ref } : null]).catch((e) => {
      console.warn('[electron-shim] tray.create', e?.message || e)
    })
  }
  setImage = (image: unknown): void => {
    const ref = imageRef(image)
    if (ref) void sys('tray.set-icon', [ref]).catch(() => {})
  }
  setToolTip = (tip: string): void => {
    void sys('tray.set-tooltip', [tip]).catch(() => {})
  }
  setContextMenu = (menu: Menu | null): void => {
    const items = trayMenuItems(menu)
    console.log('[electron-shim] tray.set-menu', JSON.stringify(items))
    void sys('tray.set-menu', [{ items }]).catch(() => {})
  }
  setTitle = (): void => {}
  popUpContextMenu = (menu?: unknown): void => {
    // macOS/Windows: Cherry never calls setContextMenu; the menu travels with
    // the popup call (Electron's popUpContextMenu(menu)).
    const items = trayMenuItems(menu)
    console.log('[electron-shim] tray.menu-popup items', JSON.stringify(items))
    void sys('tray.menu-popup', [items]).catch(() => {})
  }
  destroy = (): void => {
    trayInstances.delete(this)
    void sys('tray.destroy', []).catch(() => {})
  }
}

export class MenuItem {
  constructor(public options: Record<string, unknown>) {}
}

export const session = {
  defaultSession: {
    setPermissionRequestHandler: () => {},
    setSpellCheckerEnabled: () => {},
    setSpellCheckerLanguages: () => {},
    clearCache: async () => {},
    clearStorageData: async () => {},
    setProxy: async () => {},
    loadExtension: async () => ({}),
    getUserAgent: () => 'CherryStudio-Tauri',
    setUserAgent: () => {},
    webRequest: {
      onBeforeSendHeaders: () => {},
      onHeadersReceived: () => {}
    },
    protocol: {
      handle: () => {},
      registerFileProtocol: () => true,
      interceptFileProtocol: () => true
    },
    cookies: {
      get: async () => [],
      set: async () => {},
      remove: async () => {}
    }
  },
  fromPartition: (_partition: string) => session.defaultSession
}

export const protocol = {
  registerSchemesAsPrivileged: () => {},
  registerFileProtocol: () => true,
  handle: () => {},
  isProtocolHandled: () => false
}

export const powerMonitor = {
  on: () => powerMonitor,
  off: () => powerMonitor,
  getSystemIdleState: () => 'active',
  getSystemIdleTime: () => 0
}

export const crashReporter = {
  start: () => {},
  addExtraParameter: () => {},
  removeExtraParameter: () => {}
}
class ShimNativeImage {
  path: string
  template: boolean

  constructor(path = '', template = false) {
    this.path = path
    this.template = template
  }

  isEmpty(): boolean {
    return !this.path
  }

  resize(_options?: { width?: number; height?: number }): ShimNativeImage {
    return new ShimNativeImage(this.path, this.template)
  }

  setTemplateImage(isTemplate: boolean): void {
    this.template = isTemplate
  }

  getSize(): { width: number; height: number } {
    return { width: 16, height: 16 }
  }

  toPNG(): Buffer {
    return Buffer.alloc(0)
  }

  toDataURL(): string {
    return ''
  }
}

/** Normalize an Electron image arg (path string or NativeImage) for the shell. */
function imageRef(image: unknown): { path: string; asTemplate: boolean } | null {
  if (typeof image === 'string' && image.length > 0) {
    return { path: image, asTemplate: false }
  }
  if (image instanceof ShimNativeImage && image.path) {
    return { path: image.path, asTemplate: image.template }
  }
  return null
}

export const nativeImage = {
  createFromPath: (p?: string) => new ShimNativeImage(p || ''),
  createFromDataURL: () => new ShimNativeImage(),
  createEmpty: () => new ShimNativeImage(),
  createFromBuffer: () => new ShimNativeImage()
}

export const systemPreferences = {
  isTrustedAccessibilityClient: () => false,
  getMediaAccessStatus: () => 'granted',
  askForMediaAccess: async () => true
}

export const contentTracing = {
  startRecording: async () => {},
  stopRecording: async () => ''
}

export const webUtils = {
  getPathForFile: (file: { path?: string }) => file?.path || ''
}

export const contextBridge = {
  exposeInMainWorld: () => {}
}

export const utilityProcess = {
  fork: () => {
    throw new Error('[electron-shim] utilityProcess.fork not implemented')
  }
}

export const net = {
  fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  request: (options: { url?: string; method?: string } | string, callback?: (response: unknown) => void) => {
    const url = typeof options === 'string' ? options : options.url || ''
    const req = {
      on: () => req,
      end: () => {
        void fetch(url)
          .then(async (r) => {
            callback?.({
              statusCode: r.status,
              headers: Object.fromEntries(r.headers.entries()),
              on: (ev: string, cb: (chunk?: Buffer) => void) => {
                if (ev === 'data') {
                  void r.arrayBuffer().then((b) => cb(Buffer.from(b)))
                }
                if (ev === 'end') cb()
              }
            })
          })
          .catch(() => callback?.({ statusCode: 500, on: () => {} }))
      },
      write: () => {},
      setHeader: () => {},
      abort: () => {}
    }
    return req
  },
  isOnline: () => true
}

export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (s: string) => Buffer.from(s, 'utf8'),
  decryptString: (b: Buffer | string) => (Buffer.isBuffer(b) ? b.toString('utf8') : String(b)),
  encryptBuffer: (b: Buffer) => b,
  decryptBuffer: (b: Buffer) => b
}

export const webContents = {
  getAllWebContents: () => [sender] as WebContentsLike[],
  getFocusedWebContents: () => sender as WebContentsLike,
  fromId: (_id: number) => sender as WebContentsLike,
  fromFrame: () => sender as WebContentsLike
}

export class BrowserView extends EventEmitter {
  webContents = sender
  constructor(_options?: Record<string, unknown>) {
    super()
  }
  setBounds = (_bounds?: unknown) => {}
  getBounds = () => ({ x: 0, y: 0, width: 0, height: 0 })
  setAutoResize = (_options?: unknown) => {}
  setBackgroundColor = () => {}
  destroy = () => {}
}

export class Notification extends EventEmitter {
  static isSupported = () => true
  constructor(public options: Record<string, unknown> = {}) {
    super()
  }
  show = () => {
    const title = (this.options.title as string) || 'Cherry Studio'
    const body = (this.options.body as string) || ''
    void sys('notification.show', [{ title, body }]).catch((error) => {
      console.error('[electron-shim] notification.show', error)
    })
    this.emit('show')
  }
  close = () => this.emit('close')
}

export const powerSaveBlocker = {
  start: () => 0,
  stop: () => true,
  isStarted: () => false
}

export const desktopCapturer = {
  getSources: async () => []
}

export const inAppPurchase = {
  canMakePayments: () => false,
  purchaseProduct: async () => false,
  restoreCompletedTransactions: () => {},
  getProducts: async () => [],
  on: () => inAppPurchase
}

export const autoUpdater = {
  setFeedURL: () => {},
  checkForUpdates: () => {},
  quitAndInstall: () => {},
  on: () => autoUpdater,
  once: () => autoUpdater
}

export const contentSecurityPolicy = {
  // placeholder
}

export default {
  app,
  ipcMain,
  ipcRenderer,
  BrowserWindow,
  BrowserView,
  dialog,
  shell,
  clipboard,
  nativeTheme,
  screen,
  globalShortcut,
  Tray,
  Menu,
  MenuItem,
  session,
  protocol,
  powerMonitor,
  powerSaveBlocker,
  crashReporter,
  nativeImage,
  systemPreferences,
  contentTracing,
  webUtils,
  contextBridge,
  utilityProcess,
  net,
  safeStorage,
  webContents,
  Notification,
  desktopCapturer,
  inAppPurchase,
  autoUpdater,
  invokeIpc,
  emitIpc,
  dispatchShortcutPress,
  dispatchTrayEvent,
  dispatchTrayMenuClick,
  dispatchWindowFocus,
  getTauriWindows: () => tauriWindows,
  registerPushTarget,
  registerSystemBridge
}

// Prevent unused import lint in some pipelines
void fileURLToPath
