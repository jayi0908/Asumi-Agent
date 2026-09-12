import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/repeat.js') } catch {
  try { m = require('lodash-es'); if (!m?.['repeat']) m = require('lodash/repeat') } catch { m = require('lodash/repeat') }
}
export const repeat = m?.repeat ?? m?.default ?? m
export { repeat as default }
