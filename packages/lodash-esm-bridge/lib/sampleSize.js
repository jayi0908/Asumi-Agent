import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/sampleSize.js') } catch {
  try { m = require('lodash-es'); if (!m?.['sampleSize']) m = require('lodash/sampleSize') } catch { m = require('lodash/sampleSize') }
}
export const sampleSize = m?.sampleSize ?? m?.default ?? m
export { sampleSize as default }
