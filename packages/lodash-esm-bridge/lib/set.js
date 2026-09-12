import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/set.js') } catch { m = require('lodash/set') }
export const set = m?.set ?? m?.default ?? m
export { set as default }
