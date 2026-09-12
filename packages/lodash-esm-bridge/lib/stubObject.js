import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/stubObject.js') } catch {
  try { m = require('lodash-es'); if (!m?.['stubObject']) m = require('lodash/stubObject') } catch { m = require('lodash/stubObject') }
}
export const stubObject = m?.stubObject ?? m?.default ?? m
export { stubObject as default }
