import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/spread.js') } catch {
  try { m = require('lodash-es'); if (!m?.['spread']) m = require('lodash/spread') } catch { m = require('lodash/spread') }
}
export const spread = m?.spread ?? m?.default ?? m
export { spread as default }
