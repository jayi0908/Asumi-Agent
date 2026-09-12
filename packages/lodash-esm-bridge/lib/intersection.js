import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/intersection.js') } catch {
  try { m = require('lodash-es'); if (!m?.['intersection']) m = require('lodash/intersection') } catch { m = require('lodash/intersection') }
}
export const intersection = m?.intersection ?? m?.default ?? m
export { intersection as default }
