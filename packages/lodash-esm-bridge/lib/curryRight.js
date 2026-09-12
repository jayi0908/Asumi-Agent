import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/curryRight.js') } catch {
  try { m = require('lodash-es'); if (!m?.['curryRight']) m = require('lodash/curryRight') } catch { m = require('lodash/curryRight') }
}
export const curryRight = m?.curryRight ?? m?.default ?? m
export { curryRight as default }
