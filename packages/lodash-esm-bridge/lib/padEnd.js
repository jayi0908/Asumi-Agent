import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/padEnd.js') } catch {
  try { m = require('lodash-es'); if (!m?.['padEnd']) m = require('lodash/padEnd') } catch { m = require('lodash/padEnd') }
}
export const padEnd = m?.padEnd ?? m?.default ?? m
export { padEnd as default }
