import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let m; try { m = require('lodash-es/chunk.js') } catch { m = require('lodash/chunk') }
export const chunk = m?.chunk ?? m?.default ?? m
export { chunk as default }
