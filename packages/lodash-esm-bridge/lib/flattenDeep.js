import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/flattenDeep.js') } catch { m = require('lodash/flattenDeep') }
export const flattenDeep = m?.flattenDeep ?? m?.default ?? m
export { flattenDeep as default }
