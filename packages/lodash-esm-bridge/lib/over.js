import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/over.js') } catch {
  try { m = require('lodash-es'); if (!m?.['over']) m = require('lodash/over') } catch { m = require('lodash/over') }
}
export const over = m?.over ?? m?.default ?? m
export { over as default }
