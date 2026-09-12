import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/max.js') } catch {
  try { m = require('lodash-es'); if (!m?.['max']) m = require('lodash/max') } catch { m = require('lodash/max') }
}
export const max = m?.max ?? m?.default ?? m
export { max as default }
