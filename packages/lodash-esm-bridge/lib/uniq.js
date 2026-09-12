import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/uniq.js') } catch { m = require('lodash/uniq') }
export const uniq = m?.uniq ?? m?.default ?? m
export { uniq as default }
