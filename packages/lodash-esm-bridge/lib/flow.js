import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/flow.js') } catch {
  try { m = require('lodash-es'); if (!m?.['flow']) m = require('lodash/flow') } catch { m = require('lodash/flow') }
}
export const flow = m?.flow ?? m?.default ?? m
export { flow as default }
