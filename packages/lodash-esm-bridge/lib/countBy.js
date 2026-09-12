import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/countBy.js') } catch {
  try { m = require('lodash-es'); if (!m?.['countBy']) m = require('lodash/countBy') } catch { m = require('lodash/countBy') }
}
export const countBy = m?.countBy ?? m?.default ?? m
export { countBy as default }
