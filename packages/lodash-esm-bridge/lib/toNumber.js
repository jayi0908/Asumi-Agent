import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/toNumber.js') } catch {
  try { m = require('lodash-es'); if (!m?.['toNumber']) m = require('lodash/toNumber') } catch { m = require('lodash/toNumber') }
}
export const toNumber = m?.toNumber ?? m?.default ?? m
export { toNumber as default }
