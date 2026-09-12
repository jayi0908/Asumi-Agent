import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/noop.js') } catch { m = require('lodash/noop') }
export const noop = m?.noop ?? m?.default ?? m
export { noop as default }
