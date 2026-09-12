import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/join.js') } catch {
  try { m = require('lodash-es'); if (!m?.['join']) m = require('lodash/join') } catch { m = require('lodash/join') }
}
export const join = m?.join ?? m?.default ?? m
export { join as default }
