import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/rearg.js') } catch {
  try { m = require('lodash-es'); if (!m?.['rearg']) m = require('lodash/rearg') } catch { m = require('lodash/rearg') }
}
export const rearg = m?.rearg ?? m?.default ?? m
export { rearg as default }
