import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/methodOf.js') } catch {
  try { m = require('lodash-es'); if (!m?.['methodOf']) m = require('lodash/methodOf') } catch { m = require('lodash/methodOf') }
}
export const methodOf = m?.methodOf ?? m?.default ?? m
export { methodOf as default }
