import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/bindAll.js') } catch {
  try { m = require('lodash-es'); if (!m?.['bindAll']) m = require('lodash/bindAll') } catch { m = require('lodash/bindAll') }
}
export const bindAll = m?.bindAll ?? m?.default ?? m
export { bindAll as default }
