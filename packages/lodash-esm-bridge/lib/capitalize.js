import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/capitalize.js') } catch {
  try { m = require('lodash-es'); if (!m?.['capitalize']) m = require('lodash/capitalize') } catch { m = require('lodash/capitalize') }
}
export const capitalize = m?.capitalize ?? m?.default ?? m
export { capitalize as default }
