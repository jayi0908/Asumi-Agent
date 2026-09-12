import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/omitBy.js') } catch { m = require('lodash/omitBy') }
export const omitBy = m?.omitBy ?? m?.default ?? m
export { omitBy as default }
