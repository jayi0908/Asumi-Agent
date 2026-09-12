import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/identity.js') } catch { m = require('lodash/identity') }
export const identity = m?.identity ?? m?.default ?? m
export { identity as default }
