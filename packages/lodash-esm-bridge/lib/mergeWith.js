import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/mergeWith.js') } catch {
  try { m = require('lodash-es'); if (!m?.['mergeWith']) m = require('lodash/mergeWith') } catch { m = require('lodash/mergeWith') }
}
export const mergeWith = m?.mergeWith ?? m?.default ?? m
export { mergeWith as default }
