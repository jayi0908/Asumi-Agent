import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/replace.js') } catch {
  try { m = require('lodash-es'); if (!m?.['replace']) m = require('lodash/replace') } catch { m = require('lodash/replace') }
}
export const replace = m?.replace ?? m?.default ?? m
export { replace as default }
