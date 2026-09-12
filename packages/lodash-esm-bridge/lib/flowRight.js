import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/flowRight.js') } catch {
  try { m = require('lodash-es'); if (!m?.['flowRight']) m = require('lodash/flowRight') } catch { m = require('lodash/flowRight') }
}
export const flowRight = m?.flowRight ?? m?.default ?? m
export { flowRight as default }
