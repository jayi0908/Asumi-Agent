import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/propertyOf.js') } catch {
  try { m = require('lodash-es'); if (!m?.['propertyOf']) m = require('lodash/propertyOf') } catch { m = require('lodash/propertyOf') }
}
export const propertyOf = m?.propertyOf ?? m?.default ?? m
export { propertyOf as default }
