import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/isUndefined.js') } catch {
  try { m = require('lodash-es'); if (!m?.['isUndefined']) m = require('lodash/isUndefined') } catch { m = require('lodash/isUndefined') }
}
export const isUndefined = m?.isUndefined ?? m?.default ?? m
export { isUndefined as default }
