import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/overEvery.js') } catch {
  try { m = require('lodash-es'); if (!m?.['overEvery']) m = require('lodash/overEvery') } catch { m = require('lodash/overEvery') }
}
export const overEvery = m?.overEvery ?? m?.default ?? m
export { overEvery as default }
