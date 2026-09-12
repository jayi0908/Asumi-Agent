import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/startsWith.js') } catch {
  try { m = require('lodash-es'); if (!m?.['startsWith']) m = require('lodash/startsWith') } catch { m = require('lodash/startsWith') }
}
export const startsWith = m?.startsWith ?? m?.default ?? m
export { startsWith as default }
