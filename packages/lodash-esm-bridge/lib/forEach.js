import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/forEach.js') } catch { m = require('lodash/forEach') }
export const forEach = m?.forEach ?? m?.default ?? m
export { forEach as default }
