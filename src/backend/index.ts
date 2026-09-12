/**
 * Tauri-side Node backend entry for Cherry main process.
 */

import { createServer } from 'node:net'
import path from 'node:path'

;(process.versions as { electron?: string }).electron ||= '41.2.1-tauri-shim'
;(process as NodeJS.Process & { type?: string }).type ||= 'browser'

// Electron exposes `process.getSystemVersion()` (OS version string); Cherry's
// windowUtil/QuickAssistantService parse it. Node has no equivalent — without
// a shim the missing call rejects asynchronously and kills the whole backend.
// macOS: marketing version (e.g. "15.5") like Electron's darwin behavior;
// elsewhere: os.release() (Windows: "10.0.22631" → build parse still works).
type WithGetSystemVersion = { getSystemVersion?: () => string }
const proc = process as NodeJS.Process & WithGetSystemVersion
if (typeof proc.getSystemVersion !== 'function') {
  proc.getSystemVersion = () => {
    if (process.platform === 'darwin') {
      try {
        return (
          require('node:child_process').execSync('sw_vers -productVersion', {
            encoding: 'utf8'
          }) || ''
        ).trim()
      } catch {
        /* fall through */
      }
    }
    return require('node:os').release()
  }
}

// Exit instrumentation: the host shell relies on stderr to understand why the
// backend went away (watchdog respawn + dev logs). Any silent exit must leave a trace.
process.on('uncaughtException', (error) => {
  console.error('[cherry-backend] uncaughtException', error)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[cherry-backend] unhandledRejection', reason)
  process.exit(1)
})
process.on('SIGINT', () => {
  console.error('[cherry-backend] SIGINT received, exiting')
  process.exit(0)
})
process.on('SIGTERM', () => {
  console.error('[cherry-backend] SIGTERM received, exiting')
  process.exit(0)
})
process.on('exit', (code) => {
  console.error(`[cherry-backend] exit (code=${code})`)
})
// If the host shell dies abruptly (SIGTERM/SIGKILL before its exit hook), the
// stdout pipe chain closes; follow it so no orphaned backend holds the ports.
process.stdout.on('close', () => {
  console.error('[cherry-backend] host stdout closed, exiting')
  process.exit(0)
})
process.stdout.on('error', () => {
  console.error('[cherry-backend] host stdout error (EPIPE?), exiting')
  process.exit(0)
})

declare const __dirname: string
const repoRoot = path.resolve(__dirname, '../..')
process.chdir(repoRoot)

function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      if (addr && typeof addr === 'object') { const p = addr.port; s.close(() => resolve(p)) }
      else { reject(new Error('port alloc')) }
    })
    s.on('error', reject)
  })
}

async function main() {
  const tcpPort = process.env.CHERRY_IPC_PORT ? Number(process.env.CHERRY_IPC_PORT) : await allocatePort()
  const httpPort = process.env.CHERRY_HTTP_PORT ? Number(process.env.CHERRY_HTTP_PORT) : await allocatePort()
  process.env.CHERRY_IPC_PORT = String(tcpPort)
  process.env.CHERRY_HTTP_PORT = String(httpPort)

  // Write HTTP port to a known location for the browser bridge to read
  const fs = await import('node:fs')
  try {
    // Try writing to source dir (Vite serves src/renderer/assets as static)
    fs.writeFileSync(path.join(repoRoot, 'src/renderer/assets/cherry-backend-port.json'), 
      JSON.stringify({ tcpPort, httpPort }))
    // Also write to dist (build output)
    try { fs.mkdirSync(path.join(repoRoot, 'dist'), { recursive: true }) } catch {}
    try { fs.writeFileSync(path.join(repoRoot, 'dist/cherry-backend-port.json'), 
      JSON.stringify({ tcpPort, httpPort })) } catch {}
  } catch {}
  console.log(`[cherry-backend] ipc tcp=${tcpPort} http=${httpPort}`)

  const { startIpcHub } = await import('./ipc-hub')
  await startIpcHub(tcpPort, httpPort)

  const { startCherryMain } = await import('./start-cherry-main')
  await startCherryMain()
  console.log('[cherry-backend] Cherry main bootstrap complete')
}

main().catch((error) => {
  console.error('[cherry-backend] fatal:', error)
  process.exit(1)
})
