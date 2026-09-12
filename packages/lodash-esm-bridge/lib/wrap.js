import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/wrap.js') } catch {
  try { m = require('lodash-es'); if (!m?.['wrap']) m = require('lodash/wrap') } catch { m = require('lodash/wrap') }
}
export const wrap = m?.wrap ?? m?.default ?? m
export { wrap as default }
