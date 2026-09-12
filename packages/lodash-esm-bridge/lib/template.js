import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/template.js') } catch {
  try { m = require('lodash-es'); if (!m?.['template']) m = require('lodash/template') } catch { m = require('lodash/template') }
}
export const template = m?.template ?? m?.default ?? m
export { template as default }
