import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/reduce.js') } catch { m = require('lodash/reduce') }
export const reduce = m?.reduce ?? m?.default ?? m
export { reduce as default }
