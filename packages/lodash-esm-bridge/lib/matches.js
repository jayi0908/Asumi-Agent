import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/matches.js') } catch {
  try { m = require('lodash-es'); if (!m?.['matches']) m = require('lodash/matches') } catch { m = require('lodash/matches') }
}
export const matches = m?.matches ?? m?.default ?? m
export { matches as default }
