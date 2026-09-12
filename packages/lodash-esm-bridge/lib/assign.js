import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/assign.js') } catch { m = require('lodash/assign') }
export const assign = m?.assign ?? m?.default ?? m
export { assign as default }
