import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/every.js') } catch { m = require('lodash/every') }
export const every = m?.every ?? m?.default ?? m
export { every as default }
