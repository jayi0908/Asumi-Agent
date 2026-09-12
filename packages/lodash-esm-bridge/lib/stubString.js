import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/stubString.js') } catch {
  try { m = require('lodash-es'); if (!m?.['stubString']) m = require('lodash/stubString') } catch { m = require('lodash/stubString') }
}
export const stubString = m?.stubString ?? m?.default ?? m
export { stubString as default }
