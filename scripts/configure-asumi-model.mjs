/**
 * Point the DSH engine at the model provider configured in Cherry Studio.
 *
 * Cherry Studio keeps custom providers and their models in `user_provider` /
 * `user_model` inside `cherrystudio.sqlite`. DSH keeps the equivalent in the
 * user settings document (`$DSH_HOME/settings.yaml`, namespace `llm-pi-ai`)
 * plus a credential reference in `$DSH_HOME/.credentials.yaml`. This script
 * reads the former and writes the latter so both builds serve the same route.
 *
 * Usage:
 *   node scripts/configure-asumi-model.mjs [options]
 *
 * Options:
 *   --provider <id>     Cherry provider id (default: the provider owning --model)
 *   --model <id>        Cherry model id (default: the first enabled custom model)
 *   --route <name>      DSH provider route key (default: derived, lowercase-hyphen)
 *   --api-key <key>     Override the key read from Cherry
 *   --modalities <csv>  Model input modalities, e.g. `text,image` (default: text)
 *   --dry-run           Print the resulting sections without writing
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { parseDocument, stringify } from 'yaml'

const DSH_HOME =
  process.env.DSH_HOME || join(homedir(), 'Library/Application Support/CherryStudio-TauriDev')
const DB_PATH = process.env.CHERRY_DATA_DIR
  ? join(process.env.CHERRY_DATA_DIR, 'cherrystudio.sqlite')
  : join(DSH_HOME, 'cherrystudio.sqlite')
const SETTINGS_PATH = join(DSH_HOME, 'settings.yaml')
const CREDENTIALS_PATH = join(DSH_HOME, '.credentials.yaml')

const CREDENTIAL_ENV = 'ASUMI_MODEL_API_KEY'

/** Cherry endpoint type -> pi-ai wire protocol. */
const API_BY_ENDPOINT = {
  'openai-chat-completions': 'openai-completions',
  'openai-responses': 'openai-responses',
  'anthropic-messages': 'anthropic-messages'
}

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    if (key === 'dry-run') {
      options.dryRun = true
      continue
    }
    options[key] = argv[++i]
  }
  return options
}

function query(sql) {
  const out = execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf8' })
  return JSON.parse(out || '[]')
}

function pickModel(models, options) {
  if (options.model) {
    const found = models.find((row) => row.model_id === options.model)
    if (!found) throw new Error(`no model ${options.model} in the Cherry database`)
    return found
  }
  // A user-added provider (no preset ancestor) is what "configured in Cherry"
  // means; a preset provider's models ship with the app.
  const custom = models.find((row) => row.is_enabled && row.preset_provider_id === null)
  const any = custom ?? models.find((row) => row.is_enabled)
  if (!any) throw new Error('no enabled model in the Cherry database; pass --model')
  return any
}

function toRoute(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function readSettings() {
  if (!existsSync(SETTINGS_PATH)) return parseDocument('')
  return parseDocument(readFileSync(SETTINGS_PATH, 'utf8'))
}

function readCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) return parseDocument('version: 1\n')
  return parseDocument(readFileSync(CREDENTIALS_PATH, 'utf8'))
}

function main() {
  const options = parseArgs(process.argv.slice(2))

  if (!existsSync(DB_PATH)) {
    throw new Error(
      `Cherry database not found at ${DB_PATH}\n` +
        `Set CHERRY_DATA_DIR to the directory holding cherrystudio.sqlite.`
    )
  }

  const models = query(
    `SELECT m.provider_id, m.model_id, m.name, m.is_enabled, p.preset_provider_id
     FROM user_model m LEFT JOIN user_provider p ON p.provider_id = m.provider_id;`
  )
  const model = pickModel(models, options)
  const providerId = options.provider || model.provider_id

  const providers = query(
    `SELECT provider_id, name, endpoint_configs, default_chat_endpoint, api_keys
     FROM user_provider WHERE provider_id = '${providerId.replace(/'/g, "''")}';`
  )
  if (!providers.length) throw new Error(`no provider ${providerId} in the Cherry database`)
  const provider = providers[0]

  const endpoints = JSON.parse(provider.endpoint_configs || '{}')
  const endpointType = provider.default_chat_endpoint || Object.keys(endpoints)[0]
  const endpoint = endpoints[endpointType]
  if (!endpoint?.baseUrl) throw new Error(`provider ${providerId} has no ${endpointType} base URL`)

  const api = API_BY_ENDPOINT[endpointType]
  if (!api) throw new Error(`unsupported endpoint type ${endpointType} (add it to API_BY_ENDPOINT)`)

  const keys = JSON.parse(provider.api_keys || '[]')
  const apiKey = options['api-key'] || keys.find((entry) => entry.isEnabled)?.key
  if (!apiKey) throw new Error(`provider ${providerId} has no enabled API key`)

  const route = options.route || toRoute(provider.name || 'asumi-model')
  const modalities = (options.modalities || 'text')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  const settings = readSettings()
  settings.setIn(['llm-pi-ai', 'providers', route], {
    displayName: provider.name || route,
    apiKeyEnv: CREDENTIAL_ENV,
    api,
    baseURL: endpoint.baseUrl,
    models: [
      {
        id: model.model_id,
        name: model.name || model.model_id,
        input: modalities
      }
    ]
  })
  settings.setIn(['agent-default-model'], { provider: route, model: model.model_id })

  const credentials = readCredentials()
  credentials.setIn(['refs', CREDENTIAL_ENV], apiKey)

  console.log(`route      ${route} (${api} -> ${endpoint.baseUrl})`)
  console.log(`model      ${model.model_id} [${modalities.join(', ')}]`)
  console.log(`settings   ${SETTINGS_PATH}`)
  console.log(`credential ${CREDENTIALS_PATH} refs.${CREDENTIAL_ENV}`)

  if (options.dryRun) {
    console.log('\n--- settings.yaml ---')
    const js = settings.toJS()
    console.log(
      stringify({
        'llm-pi-ai': js['llm-pi-ai'],
        'agent-default-model': js['agent-default-model']
      })
    )
    return
  }

  write(SETTINGS_PATH, settings.toString(), 0o644)
  write(CREDENTIALS_PATH, credentials.toString(), 0o600)
}

function write(path, contents, mode) {
  writeFileSync(path, contents, { mode })
  chmodSync(path, mode)
}

main()
