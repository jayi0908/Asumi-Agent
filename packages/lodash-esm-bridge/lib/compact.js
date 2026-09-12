import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/compact.js') } catch { m = require('lodash/compact') }
export const compact = m?.compact ?? m?.default ?? m
export { compact as default }
