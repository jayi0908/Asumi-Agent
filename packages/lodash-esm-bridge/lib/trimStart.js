import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/trimStart.js') } catch {
  try { m = require('lodash-es'); if (!m?.['trimStart']) m = require('lodash/trimStart') } catch { m = require('lodash/trimStart') }
}
export const trimStart = m?.trimStart ?? m?.default ?? m
export { trimStart as default }
