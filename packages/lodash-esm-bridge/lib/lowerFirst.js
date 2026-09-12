import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/lowerFirst.js') } catch {
  try { m = require('lodash-es'); if (!m?.['lowerFirst']) m = require('lodash/lowerFirst') } catch { m = require('lodash/lowerFirst') }
}
export const lowerFirst = m?.lowerFirst ?? m?.default ?? m
export { lowerFirst as default }
