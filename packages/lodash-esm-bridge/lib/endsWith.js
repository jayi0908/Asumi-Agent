import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/endsWith.js') } catch {
  try { m = require('lodash-es'); if (!m?.['endsWith']) m = require('lodash/endsWith') } catch { m = require('lodash/endsWith') }
}
export const endsWith = m?.endsWith ?? m?.default ?? m
export { endsWith as default }
