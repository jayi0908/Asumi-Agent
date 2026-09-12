import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/bind.js') } catch {
  try { m = require('lodash-es'); if (!m?.['bind']) m = require('lodash/bind') } catch { m = require('lodash/bind') }
}
export const bind = m?.bind ?? m?.default ?? m
export { bind as default }
