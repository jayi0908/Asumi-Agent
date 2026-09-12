import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/mapKeys.js') } catch { m = require('lodash/mapKeys') }
export const mapKeys = m?.mapKeys ?? m?.default ?? m
export { mapKeys as default }
