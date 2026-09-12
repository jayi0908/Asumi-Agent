import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/union.js') } catch { m = require('lodash/union') }
export const union = m?.union ?? m?.default ?? m
export { union as default }
