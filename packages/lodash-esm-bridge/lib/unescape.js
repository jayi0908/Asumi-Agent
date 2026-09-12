import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/unescape.js') } catch {
  try { m = require('lodash-es'); if (!m?.['unescape']) m = require('lodash/unescape') } catch { m = require('lodash/unescape') }
}
export const unescape = m?.unescape ?? m?.default ?? m
export { unescape as default }
