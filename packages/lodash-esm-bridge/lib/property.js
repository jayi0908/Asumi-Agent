import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/property.js') } catch {
  try { m = require('lodash-es'); if (!m?.['property']) m = require('lodash/property') } catch { m = require('lodash/property') }
}
export const property = m?.property ?? m?.default ?? m
export { property as default }
