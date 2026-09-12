import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/unzip.js') } catch {
  try { m = require('lodash-es'); if (!m?.['unzip']) m = require('lodash/unzip') } catch { m = require('lodash/unzip') }
}
export const unzip = m?.unzip ?? m?.default ?? m
export { unzip as default }
