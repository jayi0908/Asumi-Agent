import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/stubTrue.js') } catch {
  try { m = require('lodash-es'); if (!m?.['stubTrue']) m = require('lodash/stubTrue') } catch { m = require('lodash/stubTrue') }
}
export const stubTrue = m?.stubTrue ?? m?.default ?? m
export { stubTrue as default }
