import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/clone.js') } catch {
  try { m = require('lodash-es'); if (!m?.['clone']) m = require('lodash/clone') } catch { m = require('lodash/clone') }
}
export const clone = m?.clone ?? m?.default ?? m
export { clone as default }
