import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/keyBy.js') } catch { m = require('lodash/keyBy') }
export const keyBy = m?.keyBy ?? m?.default ?? m
export { keyBy as default }
