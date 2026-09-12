import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/flattenDepth.js') } catch {
  try { m = require('lodash-es'); if (!m?.['flattenDepth']) m = require('lodash/flattenDepth') } catch { m = require('lodash/flattenDepth') }
}
export const flattenDepth = m?.flattenDepth ?? m?.default ?? m
export { flattenDepth as default }
