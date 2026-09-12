import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/filter.js') } catch { m = require('lodash/filter') }
export const filter = m?.filter ?? m?.default ?? m
export { filter as default }
