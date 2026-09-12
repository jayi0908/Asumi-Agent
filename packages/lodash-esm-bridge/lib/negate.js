import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/negate.js') } catch {
  try { m = require('lodash-es'); if (!m?.['negate']) m = require('lodash/negate') } catch { m = require('lodash/negate') }
}
export const negate = m?.negate ?? m?.default ?? m
export { negate as default }
