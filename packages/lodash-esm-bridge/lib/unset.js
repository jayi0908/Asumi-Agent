import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/unset.js') } catch {
  try { m = require('lodash-es'); if (!m?.['unset']) m = require('lodash/unset') } catch { m = require('lodash/unset') }
}
export const unset = m?.unset ?? m?.default ?? m
export { unset as default }
