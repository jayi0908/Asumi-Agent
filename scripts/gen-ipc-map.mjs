#!/usr/bin/env node
/**
 * Generate an IPC/window.api skeleton checklist from Cherry sources.
 * Output: docs/generated/ipc-channel-map.md
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ipcPath = path.join(root, 'src/shared/IpcChannel.ts')
const preloadPath = path.join(root, 'src/preload/index.ts')
const outDir = path.join(root, 'docs/generated')
const outFile = path.join(outDir, 'ipc-channel-map.md')

const ipcSrc = fs.readFileSync(ipcPath, 'utf8')
const channels = [...ipcSrc.matchAll(/^\s*([A-Za-z0-9_]+)\s*=\s*['"`]([^'"`]+)['"`]/gm)].map(
  ([, name, value]) => ({ name, value })
)

const preloadSrc = fs.readFileSync(preloadPath, 'utf8')
// naive top-level api keys: lines like `  foo:` or `  foo (` inside export const api
const apiKeys = new Set()
const apiBlock = preloadSrc.match(/(?:export\s+)?const api\s*=\s*\{([\s\S]*)\}\s*\n\s*(?:\/\/[^\n]*\n\s*)*(?:if \(process|export type WindowApiType)/)
if (apiBlock) {
  for (const m of apiBlock[1].matchAll(/^\s{2}([A-Za-z0-9_]+)\s*[:(]/gm)) {
    apiKeys.add(m[1])
  }
}

fs.mkdirSync(outDir, { recursive: true })
const baseline = fs.existsSync(path.join(root, 'docs/CHERRY_BASELINE'))
  ? fs.readFileSync(path.join(root, 'docs/CHERRY_BASELINE'), 'utf8').trim()
  : 'unknown'

const lines = [
  '# Generated IPC / window.api map',
  '',
  `Baseline: \`${baseline}\``,
  '',
  'Status defaults to `pending`. Update when porting; do not delete rows.',
  '',
  '## IpcChannel enum',
  '',
  '| Enum member | Channel string | Status | Tauri/bridge notes |',
  '|---|---|---|---|',
  ...channels.map((c) => `| \`${c.name}\` | \`${c.value}\` | pending | |`),
  '',
  '## window.api top-level keys (preload)',
  '',
  '| Key | Status | Notes |',
  '|---|---|---|',
  ...[...apiKeys].sort().map((k) => `| \`${k}\` | pending | |`),
  '',
  `Total channels: ${channels.length}`,
  `Total api keys (approx top-level): ${apiKeys.size}`,
  ''
]

fs.writeFileSync(outFile, lines.join('\n'))
console.log(`Wrote ${outFile} (${channels.length} channels, ${apiKeys.size} api keys)`)
