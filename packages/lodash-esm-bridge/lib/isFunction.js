import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/isFunction.js') } catch {
  try { m = require('lodash-es'); if (!m?.['isFunction']) m = require('lodash/isFunction') } catch { m = require('lodash/isFunction') }
}
export const isFunction = m?.isFunction ?? m?.default ?? m
export { isFunction as default }
