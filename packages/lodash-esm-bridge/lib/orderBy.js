import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/orderBy.js') } catch { m = require('lodash/orderBy') }
export const orderBy = m?.orderBy ?? m?.default ?? m
export { orderBy as default }
