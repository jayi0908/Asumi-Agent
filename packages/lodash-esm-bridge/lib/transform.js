import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/transform.js') } catch {
  try { m = require('lodash-es'); if (!m?.['transform']) m = require('lodash/transform') } catch { m = require('lodash/transform') }
}
export const transform = m?.transform ?? m?.default ?? m
export { transform as default }
