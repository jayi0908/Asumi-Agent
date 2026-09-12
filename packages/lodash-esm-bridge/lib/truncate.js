import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/truncate.js') } catch {
  try { m = require('lodash-es'); if (!m?.['truncate']) m = require('lodash/truncate') } catch { m = require('lodash/truncate') }
}
export const truncate = m?.truncate ?? m?.default ?? m
export { truncate as default }
