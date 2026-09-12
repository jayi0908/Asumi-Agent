import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/isDate.js') } catch {
  try { m = require('lodash-es'); if (!m?.['isDate']) m = require('lodash/isDate') } catch { m = require('lodash/isDate') }
}
export const isDate = m?.isDate ?? m?.default ?? m
export { isDate as default }
