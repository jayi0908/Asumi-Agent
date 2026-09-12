import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/sum.js') } catch {
  try { m = require('lodash-es'); if (!m?.['sum']) m = require('lodash/sum') } catch { m = require('lodash/sum') }
}
export const sum = m?.sum ?? m?.default ?? m
export { sum as default }
