import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/inRange.js') } catch {
  try { m = require('lodash-es'); if (!m?.['inRange']) m = require('lodash/inRange') } catch { m = require('lodash/inRange') }
}
export const inRange = m?.inRange ?? m?.default ?? m
export { inRange as default }
