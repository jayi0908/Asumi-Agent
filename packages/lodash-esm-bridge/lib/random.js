import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/random.js') } catch {
  try { m = require('lodash-es'); if (!m?.['random']) m = require('lodash/random') } catch { m = require('lodash/random') }
}
export const random = m?.random ?? m?.default ?? m
export { random as default }
