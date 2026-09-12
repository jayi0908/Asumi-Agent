import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/isObject.js') } catch {
  try { m = require('lodash-es'); if (!m?.['isObject']) m = require('lodash/isObject') } catch { m = require('lodash/isObject') }
}
export const isObject = m?.isObject ?? m?.default ?? m
export { isObject as default }
