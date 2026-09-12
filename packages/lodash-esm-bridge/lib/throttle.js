import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/throttle.js') } catch { m = require('lodash/throttle') }
export const throttle = m?.throttle ?? m?.default ?? m
export { throttle as default }
