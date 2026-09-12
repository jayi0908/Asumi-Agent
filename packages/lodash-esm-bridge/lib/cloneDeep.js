import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/cloneDeep.js') } catch { m = require('lodash/cloneDeep') }
export const cloneDeep = m?.cloneDeep ?? m?.default ?? m
export { cloneDeep as default }
