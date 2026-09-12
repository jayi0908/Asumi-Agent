import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/kebabCase.js') } catch {
  try { m = require('lodash-es'); if (!m?.['kebabCase']) m = require('lodash/kebabCase') } catch { m = require('lodash/kebabCase') }
}
export const kebabCase = m?.kebabCase ?? m?.default ?? m
export { kebabCase as default }
