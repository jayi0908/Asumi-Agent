import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/rest.js') } catch {
  try { m = require('lodash-es'); if (!m?.['rest']) m = require('lodash/rest') } catch { m = require('lodash/rest') }
}
export const rest = m?.rest ?? m?.default ?? m
export { rest as default }
