import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/has.js') } catch {
  try { m = require('lodash-es'); if (!m?.['has']) m = require('lodash/has') } catch { m = require('lodash/has') }
}
export const has = m?.has ?? m?.default ?? m
export { has as default }
