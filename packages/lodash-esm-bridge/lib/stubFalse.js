import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/stubFalse.js') } catch {
  try { m = require('lodash-es'); if (!m?.['stubFalse']) m = require('lodash/stubFalse') } catch { m = require('lodash/stubFalse') }
}
export const stubFalse = m?.stubFalse ?? m?.default ?? m
export { stubFalse as default }
