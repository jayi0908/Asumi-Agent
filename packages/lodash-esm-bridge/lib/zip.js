import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/zip.js') } catch {
  try { m = require('lodash-es'); if (!m?.['zip']) m = require('lodash/zip') } catch { m = require('lodash/zip') }
}
export const zip = m?.zip ?? m?.default ?? m
export { zip as default }
