import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/keys.js') } catch { m = require('lodash/keys') }
export const keys = m?.keys ?? m?.default ?? m
export { keys as default }
