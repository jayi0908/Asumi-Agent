import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/upperFirst.js') } catch {
  try { m = require('lodash-es'); if (!m?.['upperFirst']) m = require('lodash/upperFirst') } catch { m = require('lodash/upperFirst') }
}
export const upperFirst = m?.upperFirst ?? m?.default ?? m
export { upperFirst as default }
