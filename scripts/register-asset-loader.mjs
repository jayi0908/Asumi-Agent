import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./asset-loader.mjs', pathToFileURL('./scripts/'))
register('./workspace-alias-loader.mjs', pathToFileURL('./scripts/'))
register('./import-meta-env-loader.mjs', pathToFileURL('./scripts/'))

