import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/xor.js') } catch {
  try { m = require('lodash-es'); if (!m?.['xor']) m = require('lodash/xor') } catch { m = require('lodash/xor') }
}
export const xor = m?.xor ?? m?.default ?? m
export { xor as default }
