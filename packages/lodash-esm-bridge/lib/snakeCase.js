import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/snakeCase.js') } catch {
  try { m = require('lodash-es'); if (!m?.['snakeCase']) m = require('lodash/snakeCase') } catch { m = require('lodash/snakeCase') }
}
export const snakeCase = m?.snakeCase ?? m?.default ?? m
export { snakeCase as default }
