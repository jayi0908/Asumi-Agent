import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/pull.js') } catch {
  try { m = require('lodash-es'); if (!m?.['pull']) m = require('lodash/pull') } catch { m = require('lodash/pull') }
}
export const pull = m?.pull ?? m?.default ?? m
export { pull as default }
