import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/mean.js') } catch {
  try { m = require('lodash-es'); if (!m?.['mean']) m = require('lodash/mean') } catch { m = require('lodash/mean') }
}
export const mean = m?.mean ?? m?.default ?? m
export { mean as default }
