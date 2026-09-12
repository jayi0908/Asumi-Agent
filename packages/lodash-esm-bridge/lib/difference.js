import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/difference.js') } catch { m = require('lodash/difference') }
export const difference = m?.difference ?? m?.default ?? m
export { difference as default }
