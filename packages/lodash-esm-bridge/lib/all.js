import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const subpath = path.basename(fileURLToPath(import.meta.url), '.js')

function tryLoad() {
  // Try lodash-es named export first
  try { const m = require(`lodash-es/${subpath}.js`); if (m?.[subpath] != null) return m } catch {}
  try { const m = require(`lodash-es`); if (m?.[subpath] != null) return { [subpath]: m[subpath], default: m[subpath] } } catch {}
  // Fallback to CJS lodash
  try { const m = require(`lodash/${subpath}`); return { default: m, [subpath]: m } } catch {}
  throw new Error(`lodash subpath not found: ${subpath}`)
}
const m = tryLoad()
export const [*]=> { /* placeholder for sed replacement */ }
export default m.default ?? m
