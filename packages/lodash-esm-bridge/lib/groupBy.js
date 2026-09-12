import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/groupBy.js') } catch { m = require('lodash/groupBy') }
export const groupBy = m?.groupBy ?? m?.default ?? m
export { groupBy as default }
