import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/sample.js') } catch { m = require('lodash/sample') }
export const sample = m?.sample ?? m?.default ?? m
export { sample as default }
