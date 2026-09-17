#!/usr/bin/env node
/**
 * Assemble the engine that ships inside the app.
 *
 * A packaged Asumi Agent carries its own copy of the harness: the Node packages
 * it needs and a prepared `asumi` profile, so a machine with nothing installed
 * can still boot the agent. This script produces that tree at
 * `src-tauri/engine/`, which `tauri.conf.json` bundles as a resource.
 *
 * Two properties matter and are the reason this is not a plain `pnpm install`:
 *
 *  * **Hoisted, real directories.** Tauri copies resources and the app is
 *    signed; pnpm's default symlink farm would break both. `nodeLinker:
 *    hoisted` gives one flat tree whose files are the files.
 *  * **No pnpm at runtime.** DSH resolves a profile's plugins from the
 *    profile's own `node_modules`, so the Asumi plugins are copied in
 *    directly. `pnpm` is only needed by `dsh plugin`, which the app never runs.
 *
 * Usage:
 *   node scripts/build-engine.mjs [--out <dir>] [--no-install]
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const OUT = resolve(outIndex >= 0 ? args[outIndex + 1] : join(root, 'src-tauri/engine'))
const SKIP_INSTALL = args.includes('--no-install')

/** Bundles the profile composes, in order. */
const BUNDLES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  'asumi-plugin-persona',
  'asumi-plugin-desktop'
]

/**
 * Host packages the Asumi plugins import.
 *
 * In the repo these are symlinked by `link-dsh-packages.mjs`; here they are
 * direct dependencies so the hoisted tree has them where plugin imports resolve.
 */
const HOST_PACKAGES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/schemastery'
]

/**
 * Packages whose install scripts must run.
 *
 * The subprocess helper, the FFI build, the terminal bindings, and protobufjs
 * all ship prebuilt artifacts behind an install script; pnpm blocks those
 * unless they are allowed by name.
 */
const BUILT_DEPENDENCIES = [
  '@deepseek-ai/dsh-subprocess-local',
  'koffi',
  'node-pty',
  'protobufjs'
]

/** Plugins copied into the profile, with the package name DSH resolves. */
const PLUGIN_PACKAGES = [
  { dir: 'asumi-persona', name: 'asumi-plugin-persona' },
  { dir: 'asumi-desktop', name: 'asumi-plugin-desktop' }
]

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * The version of a host package this development tree already resolved.
 *
 * Pinning the engine install to the same versions keeps the bundled plugins'
 * imports and the harness on one copy of each package. `link-dsh-packages.mjs`
 * put the links there during postinstall.
 */
function installedVersion(name) {
  const linked = join(root, 'asumi-plugins/node_modules', name, 'package.json')
  if (existsSync(linked)) return readJson(linked).version

  const flat = join(root, 'node_modules', name, 'package.json')
  if (existsSync(flat)) return readJson(flat).version

  const store = join(root, 'node_modules/.pnpm')
  const prefix = `@deepseek-ai+${name.slice('@deepseek-ai/'.length)}@`
  const entry = existsSync(store) && readdirSync(store).find((item) => item.startsWith(prefix))
  if (entry) return entry.slice(prefix.length).split('_')[0]

  throw new Error(
    `cannot determine the resolved version of ${name}; run \`pnpm install\` first`
  )
}

/**
 * Whether `OUT` already holds an engine for `dshVersion`.
 *
 * Building is a full reinstall, so `beforeBuildCommand` should not pay for it
 * on every build; `--force` (and a clean CI checkout) rebuilds.
 */
function isCurrent(dshVersion) {
  const manifest = join(OUT, 'package.json')
  const entry = join(OUT, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(manifest) || !existsSync(entry)) return false
  try {
    return readJson(manifest).dependencies?.['@deepseek-ai/dsh'] === dshVersion
  } catch {
    return false
  }
}

function main() {
  const dshVersion = readJson(join(root, 'package.json')).dependencies['@deepseek-ai/dsh']
  if (isCurrent(dshVersion) && !args.includes('--force')) {
    console.log(`[build-engine] ${OUT} is current for ${dshVersion} (use --force to rebuild)`)
    return
  }

  const hostVersions = Object.fromEntries(
    HOST_PACKAGES.map((name) => [name, installedVersion(name)])
  )
  console.log(`[build-engine] harness ${dshVersion} -> ${OUT}`)
  for (const [name, version] of Object.entries(hostVersions)) {
    console.log(`[build-engine] host ${name}@${version}`)
  }

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  // ── harness install ────────────────────────────────────────────────
  writeFileSync(
    join(OUT, 'package.json'),
    `${JSON.stringify(
      {
        name: 'asumi-engine',
        private: true,
        type: 'module',
        dependencies: {
          '@deepseek-ai/dsh': dshVersion,
          ...hostVersions
        }
      },
      null,
      2
    )}\n`
  )

  writeFileSync(
    join(OUT, 'pnpm-workspace.yaml'),
    `# Generated by scripts/build-engine.mjs.\n` +
      `packages: []\n` +
      `nodeLinker: hoisted\n` +
      `onlyBuiltDependencies:\n` +
      BUILT_DEPENDENCIES.map((name) => `  - ${JSON.stringify(name).replaceAll('"', "'")}`).join('\n') +
      '\n'
  )

  if (!SKIP_INSTALL) {
    execFileSync('pnpm', ['install', '--prod'], { cwd: OUT, stdio: 'inherit' })
  }

  assertHarness(OUT)
  reportHoisting(OUT)

  // ── profile with the plugins copied in ─────────────────────────────
  const profile = join(OUT, 'profiles', 'asumi')
  mkdirSync(join(profile, 'node_modules'), { recursive: true })

  writeFileSync(
    join(profile, 'package.json'),
    `${JSON.stringify(
      {
        name: 'dsh-profile-asumi',
        private: true,
        // No dependencies on purpose: the plugins are vendored into
        // node_modules below, so nothing has to run pnpm at first launch.
        dsh: { profile: { bundles: BUNDLES } }
      },
      null,
      2
    )}\n`
  )

  writeFileSync(
    join(profile, 'cordis.yml'),
    `# The profile root: an empty entry list. The tree is composed by the bundles\n` +
      `# named in package.json, then cordis.patch.yml.\n[]\n`
  )
  writeFileSync(
    join(profile, 'cordis.patch.yml'),
    `# The user layer. Empty here: every Asumi customization lives in its own\n` +
      `# bundle (asumi-persona, asumi-desktop), which the profile composes above.\n[]\n`
  )

  for (const plugin of PLUGIN_PACKAGES) {
    const from = join(root, 'asumi-plugins', plugin.dir)
    if (!existsSync(from)) throw new Error(`missing plugin source: ${from}`)
    cpSync(from, join(profile, 'node_modules', plugin.name), {
      recursive: true,
      filter: (path) => !path.includes('node_modules')
    })
    console.log(`[build-engine] plugin ${plugin.name}`)
  }

  console.log(`[build-engine] profile bundles: ${BUNDLES.join(', ')}`)
  console.log('[build-engine] done')
}

/** Fail loudly here rather than at first launch inside a signed app. */
function assertHarness(out) {
  const entry = join(out, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(entry)) throw new Error(`harness entry missing after install: ${entry}`)

  for (const name of HOST_PACKAGES) {
    const path = join(out, 'node_modules', name)
    if (!existsSync(path)) {
      throw new Error(
        `host package ${name} is not resolvable from the engine tree; ` +
          `plugins would fail to import it at runtime`
      )
    }
  }
}

/** A symlinked tree would not survive resource copying, so say what we got. */
function reportHoisting(out) {
  const modules = join(out, 'node_modules')
  const entries = readdirSync(modules)
  const scoped = existsSync(join(modules, '@deepseek-ai'))
    ? readdirSync(join(modules, '@deepseek-ai')).length
    : 0
  console.log(`[build-engine] node_modules entries: ${entries.length}, @deepseek-ai: ${scoped}`)
  if (entries.includes('.pnpm')) {
    console.warn('[build-engine] note: a .pnpm store is present; hoisting may be partial')
  }
}

main()
