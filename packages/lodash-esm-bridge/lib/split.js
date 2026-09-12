import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/split.js') } catch {
  try { m = require('lodash-es'); if (!m?.['split']) m = require('lodash/split') } catch { m = require('lodash/split') }
}
export const split = m?.split ?? m?.default ?? m
export { split as default }
