import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/size.js') } catch { m = require('lodash/size') }
export const size = m?.size ?? m?.default ?? m
export { size as default }
