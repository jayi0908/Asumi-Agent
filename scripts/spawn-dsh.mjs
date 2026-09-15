/**
 * Wrapper around `dsh --profile asumi` that writes the server URL
 * (including the auth token) to `dist/dsh-url.json` for the Tauri shell
 * to read, just like the Cherry backend writes cherry-backend-port.json.
 *
 * Usage:
 *   node scripts/spawn-dsh.mjs
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// DSH_HOME — reuse the existing Cherry app data dir so sessions persist
const DSH_HOME = process.env.DSH_HOME || resolve(
  process.env.HOME || '',
  'Library/Application Support/CherryStudio-TauriDev'
)

const URL_FILE = resolve(root, 'dist', 'dsh-url.json')

// Spawn dsh
const child = spawn('pnpm', ['dsh', '--profile', 'asumi', '--no-open'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, DSH_HOME }
})

// Watch stdout for the server URL line
child.stdout.on('data', (chunk) => {
  const text = chunk.toString()
  const match = text.match(/(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/)
  if (match) {
    const url = match[1]
    const urlObj = new URL(url)
    const port = parseInt(urlObj.port, 10)
    const token = urlObj.searchParams.get('token') || ''

    const info = { url, port, token }
    mkdirSync(dirname(URL_FILE), { recursive: true })
    writeFileSync(URL_FILE, JSON.stringify(info, null, 2))
    console.error('[spawn-dsh] started:', url)
  }
  // Forward to stderr so it appears in the Tauri log
  process.stderr.write(text)
})

child.on('exit', (code) => {
  console.error(`[spawn-dsh] exited with code ${code}`)
  process.exit(code ?? 1)
})

// Forward SIGTERM to the child
process.on('SIGTERM', () => { child.kill() })
process.on('SIGINT', () => { child.kill() })
