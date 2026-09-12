import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/concat.js') } catch {
  try { m = require('lodash-es'); if (!m?.['concat']) m = require('lodash/concat') } catch { m = require('lodash/concat') }
}
export const concat = m?.concat ?? m?.default ?? m
export { concat as default }
