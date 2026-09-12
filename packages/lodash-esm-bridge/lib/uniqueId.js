import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/uniqueId.js') } catch {
  try { m = require('lodash-es'); if (!m?.['uniqueId']) m = require('lodash/uniqueId') } catch { m = require('lodash/uniqueId') }
}
export const uniqueId = m?.uniqueId ?? m?.default ?? m
export { uniqueId as default }
