import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/escapeRegExp.js') } catch {
  try { m = require('lodash-es'); if (!m?.['escapeRegExp']) m = require('lodash/escapeRegExp') } catch { m = require('lodash/escapeRegExp') }
}
export const escapeRegExp = m?.escapeRegExp ?? m?.default ?? m
export { escapeRegExp as default }
