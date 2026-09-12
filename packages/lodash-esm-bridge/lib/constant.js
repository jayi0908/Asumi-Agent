import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/constant.js') } catch { m = require('lodash/constant') }
export const constant = m?.constant ?? m?.default ?? m
export { constant as default }
