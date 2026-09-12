import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/flip.js') } catch {
  try { m = require('lodash-es'); if (!m?.['flip']) m = require('lodash/flip') } catch { m = require('lodash/flip') }
}
export const flip = m?.flip ?? m?.default ?? m
export { flip as default }
