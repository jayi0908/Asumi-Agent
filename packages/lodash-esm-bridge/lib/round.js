import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/round.js') } catch {
  try { m = require('lodash-es'); if (!m?.['round']) m = require('lodash/round') } catch { m = require('lodash/round') }
}
export const round = m?.round ?? m?.default ?? m
export { round as default }
