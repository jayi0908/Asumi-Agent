import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/now.js') } catch {
  try { m = require('lodash-es'); if (!m?.['now']) m = require('lodash/now') } catch { m = require('lodash/now') }
}
export const now = m?.now ?? m?.default ?? m
export { now as default }
