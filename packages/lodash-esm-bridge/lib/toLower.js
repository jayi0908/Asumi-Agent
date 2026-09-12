import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/toLower.js') } catch {
  try { m = require('lodash-es'); if (!m?.['toLower']) m = require('lodash/toLower') } catch { m = require('lodash/toLower') }
}
export const toLower = m?.toLower ?? m?.default ?? m
export { toLower as default }
