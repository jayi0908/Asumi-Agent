import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/once.js') } catch { m = require('lodash/once') }
export const once = m?.once ?? m?.default ?? m
export { once as default }
