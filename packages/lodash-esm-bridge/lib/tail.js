import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/tail.js') } catch {
  try { m = require('lodash-es'); if (!m?.['tail']) m = require('lodash/tail') } catch { m = require('lodash/tail') }
}
export const tail = m?.tail ?? m?.default ?? m
export { tail as default }
