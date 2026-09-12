import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/isNumber.js') } catch {
  try { m = require('lodash-es'); if (!m?.['isNumber']) m = require('lodash/isNumber') } catch { m = require('lodash/isNumber') }
}
export const isNumber = m?.isNumber ?? m?.default ?? m
export { isNumber as default }
