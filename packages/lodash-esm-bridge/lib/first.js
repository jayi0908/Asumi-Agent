import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/first.js') } catch { m = require('lodash/first') }
export const first = m?.first ?? m?.default ?? m
export { first as default }
