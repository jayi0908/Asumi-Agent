import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/ary.js') } catch {
  try { m = require('lodash-es'); if (!m?.['ary']) m = require('lodash/ary') } catch { m = require('lodash/ary') }
}
export const ary = m?.ary ?? m?.default ?? m
export { ary as default }
