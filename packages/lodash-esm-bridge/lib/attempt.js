import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/attempt.js') } catch {
  try { m = require('lodash-es'); if (!m?.['attempt']) m = require('lodash/attempt') } catch { m = require('lodash/attempt') }
}
export const attempt = m?.attempt ?? m?.default ?? m
export { attempt as default }
