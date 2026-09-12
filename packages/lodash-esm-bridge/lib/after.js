import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/after.js') } catch {
  try { m = require('lodash-es'); if (!m?.['after']) m = require('lodash/after') } catch { m = require('lodash/after') }
}
export const after = m?.after ?? m?.default ?? m
export { after as default }
