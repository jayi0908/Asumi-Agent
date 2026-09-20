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
  process.env.DSH_HOME || join(homedir(), 'Library/Application Support/AsumiAgent')
const SETTINGS_PATH = join(DSH_HOME, 'settings.yaml')
const CREDENTIALS_PATH = join(DSH_HOME, '.credentials.yaml')

/**
 * Where Cherry Studio's database may live.
 *
 * Asumi Agent never ships Cherry Studio, so this script is a one-time
 * migration helper: it reaches into the Cherry app data that the port used to
 * write, which can sit beside the harness home or in Cherry's own location.
 */
const CHERRY_DB_CANDIDATES = [
  process.env.CHERRY_DATA_DIR && join(process.env.CHERRY_DATA_DIR, 'cherrystudio.sqlite'),
  join(homedir(), 'Library/Application Support/CherryStudio-TauriDev/cherrystudio.sqlite'),
  join(homedir(), 'Library/Application Support/CherryStudio-Tauri/cherrystudio.sqlite'),
  join(homedir(), 'Library/Application Support/CherryStudio/cherrystudio.sqlite'),
  join(DSH_HOME, 'cherrystudio.sqlite')
].filter(Boolean)

const DB_PATH = CHERRY_DB_CANDIDATES.find((candidate) => existsSync(candidate))

const CREDENTIAL_ENV = 'ASUMI_MODEL_API_KEY'

/**
 * The route the fallback plugin uses, and the credential its adapter resolves.
 * Migrated too, because a fallback nobody can authenticate against is worse
 * than no fallback: the turn ends on the fallback's error instead.
 */
const FALLBACK_CREDENTIAL_ENV = 'DEEPSEEK_API_KEY'
const FALLBACK_PROVIDER = 'deepseek'

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

/** The first enabled key of a Cherry provider, or undefined. */
function readCherryKey(providerId) {
  const rows = query(
    `SELECT api_keys FROM user_provider WHERE provider_id = '${providerId.replace(/'/g, "''")}';`
  )
  if (!rows.length) return undefined
  const keys = JSON.parse(rows[0].api_keys || '[]')
  return keys.find((entry) => entry.isEnabled)?.key
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

  if (!DB_PATH) {
    throw new Error(
      'Cherry database not found. Looked in:\n' +
        CHERRY_DB_CANDIDATES.map((candidate) => `  ${candidate}`).join('\n') +
        '\nSet CHERRY_DATA_DIR to the directory holding cherrystudio.sqlite.'
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

  // A DeepSeek key enables the fallback route; absent, the app simply has no
  // fallback and says so at request time like any missing credential.
  const fallbackKey = readCherryKey(FALLBACK_PROVIDER)
  if (fallbackKey) credentials.setIn(['refs', FALLBACK_CREDENTIAL_ENV], fallbackKey)

  console.log(`route      ${route} (${api} -> ${endpoint.baseUrl})`)
  console.log(`model      ${model.model_id} [${modalities.join(', ')}]`)
  console.log(`settings   ${SETTINGS_PATH}`)
  console.log(`credential ${CREDENTIALS_PATH} refs.${CREDENTIAL_ENV}`)
  console.log(
    fallbackKey
      ? `credential ${CREDENTIALS_PATH} refs.${FALLBACK_CREDENTIAL_ENV} (fallback route)`
      : `no ${FALLBACK_PROVIDER} key in the Cherry database; fallback left unconfigured`
  )

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
