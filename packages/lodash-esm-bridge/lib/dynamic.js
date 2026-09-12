import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/**
 * Lazy bridge for any lodash/xxx subpath.
 * Uses lodash-es for named exports; falls back to CJS lodash for default.
 */
export function dynamicBridge(subpath) {
  try {
    const mod = require(`lodash-es/${subpath}.js`)
    return { default: mod[subpath] ?? mod, ...mod }
  } catch {
    try {
      const mod = require(`lodash/${subpath}`)
      return { default: mod, [subpath]: mod }
    } catch {
      throw new Error(`lodash subpath not found: ${subpath}`)
    }
  }
}
