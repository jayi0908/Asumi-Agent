import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/clamp.js') } catch {
  try { m = require('lodash-es'); if (!m?.['clamp']) m = require('lodash/clamp') } catch { m = require('lodash/clamp') }
}
export const clamp = m?.clamp ?? m?.default ?? m
export { clamp as default }
