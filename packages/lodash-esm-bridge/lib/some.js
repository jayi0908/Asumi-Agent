import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/some.js') } catch { m = require('lodash/some') }
export const some = m?.some ?? m?.default ?? m
export { some as default }
