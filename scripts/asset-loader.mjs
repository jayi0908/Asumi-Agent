/**
 * Node custom loader for Cherry main-process assets.
 * Electron-vite uses `import x from '.../icon.png?asset'` → string path.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXT_RE = /\.(png|jpe?g|gif|ico|icns|svg|webp|woff2?|ttf|eot|mp3|wav)(\?.*)?$/i

function toAbs(specifier, parentURL) {
  const clean = specifier.split('?')[0]
  if (clean.startsWith('file:')) return fileURLToPath(clean)
  if (path.isAbsolute(clean)) return clean
  if (parentURL) return path.resolve(path.dirname(fileURLToPath(parentURL)), clean)
  return path.resolve(clean)
}

export async function resolve(specifier, context, nextResolve) {
  if (EXT_RE.test(specifier) || specifier.includes('?asset')) {
    const abs = toAbs(specifier, context.parentURL)
    if (!fs.existsSync(abs)) {
      throw new Error(`[asset-loader] not found: ${abs} (specifier=${specifier})`)
    }
    return {
      shortCircuit: true,
      url: `${pathToFileURL(abs).href}?cherry-asset=1`,
      format: 'module'
    }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.includes('?cherry-asset=1') || EXT_RE.test(url.split('?')[0])) {
    const filePath = fileURLToPath(url.split('?')[0])
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(filePath)}\n`
    }
  }
  return nextLoad(url, context)
}
