import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/slice.js') } catch {
  try { m = require('lodash-es'); if (!m?.['slice']) m = require('lodash/slice') } catch { m = require('lodash/slice') }
}
export const slice = m?.slice ?? m?.default ?? m
export { slice as default }
