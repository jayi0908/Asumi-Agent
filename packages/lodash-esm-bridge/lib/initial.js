import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/initial.js') } catch {
  try { m = require('lodash-es'); if (!m?.['initial']) m = require('lodash/initial') } catch { m = require('lodash/initial') }
}
export const initial = m?.initial ?? m?.default ?? m
export { initial as default }
