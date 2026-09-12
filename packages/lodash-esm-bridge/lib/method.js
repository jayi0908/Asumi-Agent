import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/method.js') } catch {
  try { m = require('lodash-es'); if (!m?.['method']) m = require('lodash/method') } catch { m = require('lodash/method') }
}
export const method = m?.method ?? m?.default ?? m
export { method as default }
