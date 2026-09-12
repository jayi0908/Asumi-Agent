import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/head.js') } catch {
  try { m = require('lodash-es'); if (!m?.['head']) m = require('lodash/head') } catch { m = require('lodash/head') }
}
export const head = m?.head ?? m?.default ?? m
export { head as default }
