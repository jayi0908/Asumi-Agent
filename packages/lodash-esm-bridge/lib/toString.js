import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/toString.js') } catch {
  try { m = require('lodash-es'); if (!m?.['toString']) m = require('lodash/toString') } catch { m = require('lodash/toString') }
}
export const toString = m?.toString ?? m?.default ?? m
export { toString as default }
