import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/toUpper.js') } catch {
  try { m = require('lodash-es'); if (!m?.['toUpper']) m = require('lodash/toUpper') } catch { m = require('lodash/toUpper') }
}
export const toUpper = m?.toUpper ?? m?.default ?? m
export { toUpper as default }
