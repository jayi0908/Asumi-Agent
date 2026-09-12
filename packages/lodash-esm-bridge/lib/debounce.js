import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/debounce.js') } catch { m = require('lodash/debounce') }
export const debounce = m?.debounce ?? m?.default ?? m
export { debounce as default }
