import http from 'node:http'
import { createServer, type Socket } from 'node:net'

import {
  dispatchShortcutPress,
  dispatchTrayEvent,
  dispatchTrayMenuClick,
  dispatchWindowFocus,
  emitIpc,
  ipcMain,
  invokeIpc,
  nativeTheme,
  registerPushTarget,
  registerSystemBridge
} from 'electron'

export type HubMessage =
  | { id: string; type: 'invoke'; channel: string; args: unknown[] }
  | { type: 'send'; channel: string; args: unknown[] }
  | { id: string; type: 'result'; result: unknown }
  | { id: string; type: 'error'; error: { message: string; stack?: string } }
  | { type: 'event'; channel: string; args: unknown[] }
  | { id: string; type: 'sys'; channel: string; args: unknown[] }
  | { id: string; type: 'sys-result'; result: unknown }
  | { id: string; type: 'sys-error'; error: { message: string } }
  | { type: 'shortcut-press'; accelerator: string }
  | { type: 'window-focus'; label: string; focused: boolean }
  | { type: 'tray-event'; event: 'click' | 'right-click' }
  | { type: 'tray-menu-click'; id: string }
  | { type: 'theme-changed'; theme: string }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'ready' }

function write(socket: Socket, msg: HubMessage): void {
  socket.write(`${JSON.stringify(msg)}\n`)
}

export function startIpcHub(
  tcpPort: number,
  httpPort: number,
  host = '127.0.0.1'
): Promise<http.Server[]> {
  const servers: http.Server[] = []
  const clients = new Set<Socket>()
  const sseClients = new Set<http.ServerResponse>()
  let primarySocket: Socket | null = null
  const sysPending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()

  const unsub = registerPushTarget((channel, args) => {
    const msg: HubMessage = { type: 'event', channel, args }
    const line = `${JSON.stringify(msg)}\n`
    for (const c of clients) {
      try { c.write(line) } catch { /* ignore */ }
    }
    const sseData = `data: ${JSON.stringify(msg)}\n\n`
    for (const res of sseClients) {
      try { res.write(sseData) } catch { sseClients.delete(res) }
    }
  })

  // Reverse bridge: Node (shim system APIs) → Tauri shell → native OS call.
  // Waits for the shell socket (non-blocking poll) so calls made during the
  // backend boot (e.g. opening windows at onReady) still reach a connected shell.
  const systemBridgeCall = (channel: string, args: unknown[]): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const id = `sys_${Date.now()}_${Math.random().toString(36).slice(2)}`
      let settled = false
      sysPending.set(id, {
        resolve: (v) => { if (!settled) { settled = true; resolve(v) } },
        reject: (e) => { if (!settled) { settled = true; reject(e) } }
      })
      setTimeout(() => {
        if (sysPending.delete(id)) { if (!settled) { settled = true; reject(new Error(`sys bridge timeout: ${channel}`)) } }
      }, 120_000)
      const attempt = () => {
        const sock = primarySocket
        if (!sock) { setTimeout(attempt, 150); return }
        write(sock, { id, type: 'sys', channel, args })
      }
      attempt()
    })
  }
  const unsubSys = registerSystemBridge(systemBridgeCall)

  // Seed the shim's nativeTheme with the shell's effective theme once the
  // shell is connected (so ThemeService's initial values match the OS).
  let themeSeeded = false
  const seedTheme = (): void => {
    if (themeSeeded) return
    themeSeeded = true
    void systemBridgeCall('theme.get', [])
      .then((res) => {
        const theme = (res as { theme?: string | null })?.theme
        if (theme === 'dark' || theme === 'light') nativeTheme.applyTheme(theme)
      })
      .catch(() => {
        themeSeeded = false
      })
  }

  const tcpServer = createServer((socket) => {
    clients.add(socket)
    if (!primarySocket) {
      primarySocket = socket
      seedTheme()
    }
    write(socket, { type: 'ready' })

    let buffer = ''
    socket.on('data', async (chunk) => {
      buffer += chunk.toString('utf8')
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line) continue
        let msg: HubMessage
        try { msg = JSON.parse(line) as HubMessage } catch { continue }
        if (msg.type === 'ping') { write(socket, { type: 'pong' }); continue }
        if (msg.type === 'shortcut-press') {
          if (typeof msg.accelerator === 'string') dispatchShortcutPress(msg.accelerator)
          continue
        }
        if (msg.type === 'window-focus') {
          if (typeof msg.label === 'string') dispatchWindowFocus(msg.label, !!msg.focused)
          continue
        }
        if (msg.type === 'tray-event') {
          if (msg.event === 'click' || msg.event === 'right-click') dispatchTrayEvent(msg.event)
          continue
        }
        if (msg.type === 'tray-menu-click') {
          if (typeof msg.id === 'string') dispatchTrayMenuClick(msg.id)
          continue
        }
        if (msg.type === 'theme-changed') {
          nativeTheme.applyTheme(typeof msg.theme === 'string' ? msg.theme : null)
          continue
        }
        if (msg.type === 'sys-result' || msg.type === 'sys-error') {
          const p = sysPending.get(msg.id)
          if (!p) continue
          sysPending.delete(msg.id)
          if (msg.type === 'sys-result') p.resolve(msg.result)
          else p.reject(new Error(msg.error?.message || 'sys error'))
          continue
        }
        if (msg.type === 'send') {
          // Fire-and-forget to ipcMain.on listeners; no response expected.
          try { emitIpc(msg.channel, ...(msg.args ?? [])) } catch { /* ignore */ }
          continue
        }
        if (msg.type !== 'invoke' || !('id' in msg)) continue
        try {
          const result = await invokeIpc(msg.channel, ...(msg.args ?? []))
          write(socket, { id: msg.id, type: 'result', result })
        } catch (error) {
          const err = error as Error
          write(socket, { id: msg.id, type: 'error', error: { message: err?.message || String(error), stack: err?.stack } })
        }
      }
    })
    socket.on('close', () => {
      clients.delete(socket)
      if (primarySocket === socket) primarySocket = null
    })
    socket.on('error', () => {
      clients.delete(socket)
      if (primarySocket === socket) primarySocket = null
    })
  })

  const httpServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    if (req.method === 'GET' && req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      })
      res.write(':ok\n\n')
      sseClients.add(res)
      req.on('close', () => sseClients.delete(res))
      return
    }

    if (req.method === 'POST' && req.url === '/send') {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        try {
          const msg = JSON.parse(body) as { channel: string; args?: unknown[] }
          emitIpc(msg.channel, ...(msg.args ?? []))
        } catch { /* ignore malformed send */ }
        res.writeHead(204)
        res.end()
      })
      return
    }

    if (req.method === 'POST' && req.url === '/invoke') {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', async () => {
        try {
          const msg = JSON.parse(body) as { id: string; channel: string; args?: unknown[] }
          const result = await invokeIpc(msg.channel, ...(msg.args ?? []))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ id: msg.id, type: 'result', result }))
        } catch (error: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ type: 'error', error: { message: error?.message || String(error) } }))
        }
      })
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('cherry backend ok\n')
  })

  return new Promise((resolve, reject) => {
    let started = 0
    tcpServer.on('error', reject)
    httpServer.on('error', reject)
    tcpServer.listen(tcpPort, host, () => { if (++started === 2) resolve(servers) })
    httpServer.listen(httpPort, host, () => { if (++started === 2) resolve(servers) })
    tcpServer.on('close', () => { unsub(); unsubSys(); httpServer.close() })
    httpServer.on('close', () => { unsub(); unsubSys() })
  })
}
