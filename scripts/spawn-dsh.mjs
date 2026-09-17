/**
 * Dev-mode entry point for Asumi Agent (DSH engine).
 *
 * 1. Starts a lightweight HTTP server on the DSH placeholder port (9999)
 *    so the Tauri CLI has something to connect to.
 * 2. Starts `dsh --profile asumi` as a child process.
 * 3. Watches stdout for the auth-token URL line.
 * 4. Writes the real DSH URL to `dist/dsh-url.json` for the Rust shell.
 * 5. The Rust shell reads that file and navigates the webview to the
 *    token-authenticated DSH web client.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const DSH_HOME = process.env.DSH_HOME || resolve(
  process.env.HOME || '',
  'Library/Application Support/CherryStudio-TauriDev'
)

const PLACEHOLDER_PORT = 9999
const DSH_DEFAULT_PORT = 3080
const URL_FILE = resolve(root, 'dist', 'dsh-url.json')

// ── Placeholder HTTP server (for Tauri dev CLI) ──────────────────────
// Serves a minimal "waiting for DSH" page so the CLI sees a responsive URL.
const LOADING_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="5">
<title>Asumi Agent — starting…</title>
<style>body{background:#1a1a2e;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;flex-direction:column;gap:1em}
.spinner{width:32px;height:32px;border:3px solid #555;border-top-color:#8b5cf6;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}</style></head>
<body><div class="spinner"></div><div>Asumi Agent 正在启动…</div></body></html>`

const placeholder = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(LOADING_HTML)
})
placeholder.listen(PLACEHOLDER_PORT, '127.0.0.1')

// A leftover URL from an earlier run would send the shell to a dead token
// before this run's engine is up, so the file's presence must mean "ready".
rmSync(URL_FILE, { force: true })

// ── Spawn DSH ───────────────────────────────────────────────────────
const child = spawn('pnpm', ['dsh', '--profile', 'asumi', '--no-open'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, DSH_HOME }
})

child.stdout.on('data', (chunk) => {
  const text = chunk.toString()
  const match = text.match(/(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/)
  if (match) {
    const url = match[1]
    const urlObj = new URL(url)
    const port = parseInt(urlObj.port, 10) || DSH_DEFAULT_PORT
    const token = urlObj.searchParams.get('token') || ''
    const info = { url, port, token }
    mkdirSync(dirname(URL_FILE), { recursive: true })
    writeFileSync(URL_FILE, JSON.stringify(info, null, 2))
    console.error('[spawn-dsh] DSH ready at', url)
  }
  process.stderr.write(text)
})

child.on('exit', (code) => {
  console.error(`[spawn-dsh] DSH exited with code ${code}`)
  placeholder.close()
  process.exit(code ?? 1)
})

process.on('SIGTERM', () => { child.kill() })
process.on('SIGINT', () => { child.kill() })
