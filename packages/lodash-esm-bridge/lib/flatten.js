import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/flatten.js') } catch { m = require('lodash/flatten') }
export const flatten = m?.flatten ?? m?.default ?? m
export { flatten as default }
