import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/forEachRight.js') } catch {
  try { m = require('lodash-es'); if (!m?.['forEachRight']) m = require('lodash/forEachRight') } catch { m = require('lodash/forEachRight') }
}
export const forEachRight = m?.forEachRight ?? m?.default ?? m
export { forEachRight as default }
