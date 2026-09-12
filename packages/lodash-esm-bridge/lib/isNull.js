import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/isNull.js') } catch {
  try { m = require('lodash-es'); if (!m?.['isNull']) m = require('lodash/isNull') } catch { m = require('lodash/isNull') }
}
export const isNull = m?.isNull ?? m?.default ?? m
export { isNull as default }
