import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/result.js') } catch {
  try { m = require('lodash-es'); if (!m?.['result']) m = require('lodash/result') } catch { m = require('lodash/result') }
}
export const result = m?.result ?? m?.default ?? m
export { result as default }
