import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/assignWith.js') } catch {
  try { m = require('lodash-es'); if (!m?.['assignWith']) m = require('lodash/assignWith') } catch { m = require('lodash/assignWith') }
}
export const assignWith = m?.assignWith ?? m?.default ?? m
export { assignWith as default }
