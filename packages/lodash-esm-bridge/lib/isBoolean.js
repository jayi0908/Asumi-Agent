import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/isBoolean.js') } catch {
  try { m = require('lodash-es'); if (!m?.['isBoolean']) m = require('lodash/isBoolean') } catch { m = require('lodash/isBoolean') }
}
export const isBoolean = m?.isBoolean ?? m?.default ?? m
export { isBoolean as default }
