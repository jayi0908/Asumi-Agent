/**
 * Generate renderer window.api from Cherry preload.
 * Replaces Electron ipcRenderer with bridge transport.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const preloadPath = path.join(root, 'src/preload/index.ts')
const outPath = path.join(root, 'src/bridge/window-api.generated.ts')

let src = fs.readFileSync(preloadPath, 'utf8')

// Drop electron/toolkit only imports & inject transport
src = src.replace(
  /^import type \{ OpenDialogOptions \} from 'electron'\n/m,
  `type OpenDialogOptions = Record<string, unknown>\n`
)
src = src.replace(
  /^import \{ contextBridge, ipcRenderer, shell, webUtils \} from 'electron'\n/m,
  `import { ipcRenderer, shell, webUtils } from './transport'\n`
)
src = src.replace(/^import \{ electronAPI \} from '@electron-toolkit\/preload'\n/m, '')
src = src.replace(/Electron\.OpenDialogOptions/g, 'OpenDialogOptions')
src = src.replace(/: Electron\.\w+/g, ': any')
src = src.replace(/import type \{ \w+ \} from 'electron'\n/g, '')

// Remove contextBridge export block at end — bridge uses installWindowApi()
src = src.replace(
  /\/\/ Use `contextBridge`[\s\S]*export type WindowApiType = typeof api\s*$/m,
  `export type WindowApiType = typeof api

export function installGeneratedWindowApi(): void {
  Object.defineProperty(window, 'api', {
    value: api,
    writable: false,
    configurable: true
  })
  // Minimal electron surface some Cherry code expects
  Object.defineProperty(window, 'electron', {
    value: {
      process: { platform: navigator.userAgentData?.platform ?? navigator.platform },
      ipcRenderer: ipcRenderer
    },
    writable: false,
    configurable: true
  })
}
`
)

// Prepend banner
const banner = `/** AUTO-GENERATED from src/preload/index.ts — do not edit. Run: pnpm gen:window-api */\n`
fs.writeFileSync(outPath, banner + src)
console.log('Wrote', outPath)
