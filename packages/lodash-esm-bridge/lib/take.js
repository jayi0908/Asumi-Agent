import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/take.js') } catch {
  try { m = require('lodash-es'); if (!m?.['take']) m = require('lodash/take') } catch { m = require('lodash/take') }
}
export const take = m?.take ?? m?.default ?? m
export { take as default }
