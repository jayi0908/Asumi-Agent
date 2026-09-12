import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/mapValues.js') } catch { m = require('lodash/mapValues') }
export const mapValues = m?.mapValues ?? m?.default ?? m
export { mapValues as default }
