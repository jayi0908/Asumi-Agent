import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/escape.js') } catch {
  try { m = require('lodash-es'); if (!m?.['escape']) m = require('lodash/escape') } catch { m = require('lodash/escape') }
}
export const escape = m?.escape ?? m?.default ?? m
export { escape as default }
