import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/omit.js') } catch { m = require('lodash/omit') }
export const omit = m?.omit ?? m?.default ?? m
export { omit as default }
