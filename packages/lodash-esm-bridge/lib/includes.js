import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/includes.js') } catch {
  try { m = require('lodash-es'); if (!m?.['includes']) m = require('lodash/includes') } catch { m = require('lodash/includes') }
}
export const includes = m?.includes ?? m?.default ?? m
export { includes as default }
