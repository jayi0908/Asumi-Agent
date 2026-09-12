import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/min.js') } catch {
  try { m = require('lodash-es'); if (!m?.['min']) m = require('lodash/min') } catch { m = require('lodash/min') }
}
export const min = m?.min ?? m?.default ?? m
export { min as default }
