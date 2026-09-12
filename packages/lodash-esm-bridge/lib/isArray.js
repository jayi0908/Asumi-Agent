import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/isArray.js') } catch {
  try { m = require('lodash-es'); if (!m?.['isArray']) m = require('lodash/isArray') } catch { m = require('lodash/isArray') }
}
export const isArray = m?.isArray ?? m?.default ?? m
export { isArray as default }
