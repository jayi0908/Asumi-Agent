import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/uniqBy.js') } catch { m = require('lodash/uniqBy') }
export const uniqBy = m?.uniqBy ?? m?.default ?? m
export { uniqBy as default }
