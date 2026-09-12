import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/before.js') } catch {
  try { m = require('lodash-es'); if (!m?.['before']) m = require('lodash/before') } catch { m = require('lodash/before') }
}
export const before = m?.before ?? m?.default ?? m
export { before as default }
