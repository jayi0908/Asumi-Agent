import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/overSome.js') } catch {
  try { m = require('lodash-es'); if (!m?.['overSome']) m = require('lodash/overSome') } catch { m = require('lodash/overSome') }
}
export const overSome = m?.overSome ?? m?.default ?? m
export { overSome as default }
