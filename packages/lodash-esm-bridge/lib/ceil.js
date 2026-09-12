import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/ceil.js') } catch {
  try { m = require('lodash-es'); if (!m?.['ceil']) m = require('lodash/ceil') } catch { m = require('lodash/ceil') }
}
export const ceil = m?.ceil ?? m?.default ?? m
export { ceil as default }
