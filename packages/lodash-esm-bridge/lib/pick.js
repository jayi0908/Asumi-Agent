import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/pick.js') } catch { m = require('lodash/pick') }
export const pick = m?.pick ?? m?.default ?? m
export { pick as default }
