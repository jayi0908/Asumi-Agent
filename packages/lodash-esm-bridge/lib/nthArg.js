import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/nthArg.js') } catch {
  try { m = require('lodash-es'); if (!m?.['nthArg']) m = require('lodash/nthArg') } catch { m = require('lodash/nthArg') }
}
export const nthArg = m?.nthArg ?? m?.default ?? m
export { nthArg as default }
