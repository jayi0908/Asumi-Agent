import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/find.js') } catch {
  try { m = require('lodash-es'); if (!m?.['find']) m = require('lodash/find') } catch { m = require('lodash/find') }
}
export const find = m?.find ?? m?.default ?? m
export { find as default }
