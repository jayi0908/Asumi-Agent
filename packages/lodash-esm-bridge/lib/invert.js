import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/invert.js') } catch {
  try { m = require('lodash-es'); if (!m?.['invert']) m = require('lodash/invert') } catch { m = require('lodash/invert') }
}
export const invert = m?.invert ?? m?.default ?? m
export { invert as default }
