import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/isPlainObject.js') } catch {
  try { m = require('lodash-es'); if (!m?.['isPlainObject']) m = require('lodash/isPlainObject') } catch { m = require('lodash/isPlainObject') }
}
export const isPlainObject = m?.isPlainObject ?? m?.default ?? m
export { isPlainObject as default }
