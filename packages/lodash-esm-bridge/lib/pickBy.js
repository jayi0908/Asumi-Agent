import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/pickBy.js') } catch { m = require('lodash/pickBy') }
export const pickBy = m?.pickBy ?? m?.default ?? m
export { pickBy as default }
