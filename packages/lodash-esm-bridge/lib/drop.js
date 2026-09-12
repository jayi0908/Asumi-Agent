import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/drop.js') } catch {
  try { m = require('lodash-es'); if (!m?.['drop']) m = require('lodash/drop') } catch { m = require('lodash/drop') }
}
export const drop = m?.drop ?? m?.default ?? m
export { drop as default }
