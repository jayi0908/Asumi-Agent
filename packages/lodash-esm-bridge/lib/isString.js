import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/isString.js') } catch {
  try { m = require('lodash-es'); if (!m?.['isString']) m = require('lodash/isString') } catch { m = require('lodash/isString') }
}
export const isString = m?.isString ?? m?.default ?? m
export { isString as default }
