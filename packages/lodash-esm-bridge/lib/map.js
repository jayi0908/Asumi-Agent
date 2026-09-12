import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/map.js') } catch {
  try { m = require('lodash-es'); if (!m?.['map']) m = require('lodash/map') } catch { m = require('lodash/map') }
}
export const map = m?.map ?? m?.default ?? m
export { map as default }
