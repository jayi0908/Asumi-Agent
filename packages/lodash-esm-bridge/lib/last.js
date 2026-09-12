import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/last.js') } catch { m = require('lodash/last') }
export const last = m?.last ?? m?.default ?? m
export { last as default }
