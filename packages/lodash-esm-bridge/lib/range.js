import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/range.js') } catch { m = require('lodash/range') }
export const range = m?.range ?? m?.default ?? m
export { range as default }
