import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/without.js') } catch {
  try { m = require('lodash-es'); if (!m?.['without']) m = require('lodash/without') } catch { m = require('lodash/without') }
}
export const without = m?.without ?? m?.default ?? m
export { without as default }
