import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/parseInt.js') } catch {
  try { m = require('lodash-es'); if (!m?.['parseInt']) m = require('lodash/parseInt') } catch { m = require('lodash/parseInt') }
}
export const parseInt = m?.parseInt ?? m?.default ?? m
export { parseInt as default }
