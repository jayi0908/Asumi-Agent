import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/matchesProperty.js') } catch {
  try { m = require('lodash-es'); if (!m?.['matchesProperty']) m = require('lodash/matchesProperty') } catch { m = require('lodash/matchesProperty') }
}
export const matchesProperty = m?.matchesProperty ?? m?.default ?? m
export { matchesProperty as default }
