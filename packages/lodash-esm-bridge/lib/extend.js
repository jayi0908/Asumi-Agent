import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/extend.js') } catch { m = require('lodash/extend') }
export const extend = m?.extend ?? m?.default ?? m
export { extend as default }
