import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/camelCase.js') } catch {
  try { m = require('lodash-es'); if (!m?.['camelCase']) m = require('lodash/camelCase') } catch { m = require('lodash/camelCase') }
}
export const camelCase = m?.camelCase ?? m?.default ?? m
export { camelCase as default }
