import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/remove.js') } catch {
  try { m = require('lodash-es'); if (!m?.['remove']) m = require('lodash/remove') } catch { m = require('lodash/remove') }
}
export const remove = m?.remove ?? m?.default ?? m
export { remove as default }
