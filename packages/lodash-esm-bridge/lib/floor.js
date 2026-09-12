import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/floor.js') } catch {
  try { m = require('lodash-es'); if (!m?.['floor']) m = require('lodash/floor') } catch { m = require('lodash/floor') }
}
export const floor = m?.floor ?? m?.default ?? m
export { floor as default }
