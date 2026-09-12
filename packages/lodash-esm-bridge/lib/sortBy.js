import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/sortBy.js') } catch { m = require('lodash/sortBy') }
export const sortBy = m?.sortBy ?? m?.default ?? m
export { sortBy as default }
