import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/reject.js') } catch {
  try { m = require('lodash-es'); if (!m?.['reject']) m = require('lodash/reject') } catch { m = require('lodash/reject') }
}
export const reject = m?.reject ?? m?.default ?? m
export { reject as default }
