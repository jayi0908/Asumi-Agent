import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/shuffle.js') } catch { m = require('lodash/shuffle') }
export const shuffle = m?.shuffle ?? m?.default ?? m
export { shuffle as default }
