import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/padStart.js') } catch {
  try { m = require('lodash-es'); if (!m?.['padStart']) m = require('lodash/padStart') } catch { m = require('lodash/padStart') }
}
export const padStart = m?.padStart ?? m?.default ?? m
export { padStart as default }
