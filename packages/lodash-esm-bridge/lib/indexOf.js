import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/indexOf.js') } catch {
  try { m = require('lodash-es'); if (!m?.['indexOf']) m = require('lodash/indexOf') } catch { m = require('lodash/indexOf') }
}
export const indexOf = m?.indexOf ?? m?.default ?? m
export { indexOf as default }
