import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/partition.js') } catch {
  try { m = require('lodash-es'); if (!m?.['partition']) m = require('lodash/partition') } catch { m = require('lodash/partition') }
}
export const partition = m?.partition ?? m?.default ?? m
export { partition as default }
