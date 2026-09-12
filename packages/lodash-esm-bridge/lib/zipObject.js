import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/zipObject.js') } catch {
  try { m = require('lodash-es'); if (!m?.['zipObject']) m = require('lodash/zipObject') } catch { m = require('lodash/zipObject') }
}
export const zipObject = m?.zipObject ?? m?.default ?? m
export { zipObject as default }
