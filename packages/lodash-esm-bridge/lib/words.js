import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m
try { m = require('lodash-es/words.js') } catch {
  try { m = require('lodash-es'); if (!m?.['words']) m = require('lodash/words') } catch { m = require('lodash/words') }
}
export const words = m?.words ?? m?.default ?? m
export { words as default }
