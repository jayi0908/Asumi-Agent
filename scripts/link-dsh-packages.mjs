#!/usr/bin/env node
/**
 * Make the host DSH packages importable from the in-repo Asumi plugins.
 *
 * `asumi-plugins/*` are installed into the `asumi` profile via `link:`, so Node
 * resolves their imports from the repo tree. The host packages
 * (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, …) live in pnpm's store but
 * are not hoisted to the repo root. This script links them into
 * `asumi-plugins/node_modules/@deepseek-ai/` so plugins can import them.
 *
 * Idempotent; runs as part of `postinstall`. Silent when the store is absent.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pnpmDir = join(root, 'node_modules', '.pnpm')
const scopeDir = join(root, 'asumi-plugins', 'node_modules', '@deepseek-ai')

/** Host packages Asumi plugins may import. */
const PACKAGES = ['cordis', 'dsh-tools', 'dsh-system-prompt', 'schemastery']

if (!existsSync(pnpmDir)) process.exit(0)

mkdirSync(scopeDir, { recursive: true })

let linked = 0
for (const pkg of PACKAGES) {
  const prefix = `@deepseek-ai+${pkg}@`
  const match = readdirSync(pnpmDir).find((entry) => entry.startsWith(prefix))
  if (!match) continue

  const source = join(pnpmDir, match, 'node_modules', '@deepseek-ai', pkg)
  if (!existsSync(source)) continue

  const link = join(scopeDir, pkg)
  rmSync(link, { recursive: true, force: true })
  symlinkSync(source, link)
  linked++
}

if (linked) console.log(`[link-dsh-packages] linked ${linked} host package(s)`)
