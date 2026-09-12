import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/trimEnd.js') } catch {
  try { m = require('lodash-es'); if (!m?.['trimEnd']) m = require('lodash/trimEnd') } catch { m = require('lodash/trimEnd') }
}
export const trimEnd = m?.trimEnd ?? m?.default ?? m
export { trimEnd as default }
