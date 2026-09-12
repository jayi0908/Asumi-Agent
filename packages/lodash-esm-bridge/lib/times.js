import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/times.js') } catch { m = require('lodash/times') }
export const times = m?.times ?? m?.default ?? m
export { times as default }
