import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/values.js') } catch { m = require('lodash/values') }
export const values = m?.values ?? m?.default ?? m
export { values as default }
