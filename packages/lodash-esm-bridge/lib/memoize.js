import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/memoize.js') } catch { m = require('lodash/memoize') }
export const memoize = m?.memoize ?? m?.default ?? m
export { memoize as default }
