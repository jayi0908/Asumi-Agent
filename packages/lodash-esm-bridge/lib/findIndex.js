import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/findIndex.js') } catch {
  try { m = require('lodash-es'); if (!m?.['findIndex']) m = require('lodash/findIndex') } catch { m = require('lodash/findIndex') }
}
export const findIndex = m?.findIndex ?? m?.default ?? m
export { findIndex as default }
