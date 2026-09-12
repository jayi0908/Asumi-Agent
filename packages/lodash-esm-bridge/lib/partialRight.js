import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/partialRight.js') } catch {
  try { m = require('lodash-es'); if (!m?.['partialRight']) m = require('lodash/partialRight') } catch { m = require('lodash/partialRight') }
}
export const partialRight = m?.partialRight ?? m?.default ?? m
export { partialRight as default }
