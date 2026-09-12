import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/curry.js') } catch {
  try { m = require('lodash-es'); if (!m?.['curry']) m = require('lodash/curry') } catch { m = require('lodash/curry') }
}
export const curry = m?.curry ?? m?.default ?? m
export { curry as default }
