import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/defaultsDeep.js') } catch {
  try { m = require('lodash-es'); if (!m?.['defaultsDeep']) m = require('lodash/defaultsDeep') } catch { m = require('lodash/defaultsDeep') }
}
export const defaultsDeep = m?.defaultsDeep ?? m?.default ?? m
export { defaultsDeep as default }
