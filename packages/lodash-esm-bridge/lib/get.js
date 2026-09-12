import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/get.js') } catch { m = require('lodash/get') }
export const get = m?.get ?? m?.default ?? m
export { get as default }
