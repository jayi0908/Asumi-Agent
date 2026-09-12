import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/stubArray.js') } catch {
  try { m = require('lodash-es'); if (!m?.['stubArray']) m = require('lodash/stubArray') } catch { m = require('lodash/stubArray') }
}
export const stubArray = m?.stubArray ?? m?.default ?? m
export { stubArray as default }
