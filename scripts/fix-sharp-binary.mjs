#!/usr/bin/env node
/**
 * Fix sharp@0.35.4's darwin-arm64 native binary.
 *
 * Why this exists:
 *   The workspace pins `@img/sharp-darwin-arm64` to 0.34.5 (a Cherry-era
 *   override). DSH's `@deepseek-ai/dsh-attachment-local` depends on
 *   `sharp@0.35.4`, whose native binding requires the matching 0.35.4
 *   binary plus libvips 1.3.3. With the override in place pnpm links the
 *   0.34.5 binary into sharp 0.35.4, and the module throws
 *   `Cannot read properties of undefined (reading 'output')` at import.
 *
 * What this does (darwin-arm64 only, idempotent):
 *   1. Ensures the 0.35.4 binding package exists, extracted from the
 *      vendored tarball when pnpm did not install it.
 *   2. Links the already-installed libvips 1.3.3 as its sibling so the
 *      dylib rpath resolves.
 *   3. Repoints sharp@0.35.4's `@img/sharp-darwin-arm64` to that package.
 *
 * Runs as `postinstall`. Safe to run repeatedly; silent on other platforms
 * or when sharp 0.35.4 is absent.
 */
import { existsSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync, cpSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pnpmDir = join(root, 'node_modules', '.pnpm')

if (!existsSync(pnpmDir)) process.exit(0)
if (process.platform !== 'darwin' || process.arch !== 'arm64') process.exit(0)

const TARBALL = join(root, 'vendor', 'sharp', 'sharp-darwin-arm64-0.35.4.tgz')
const BINDING_PKG = join(pnpmDir, '@img+sharp-darwin-arm64@0.35.4', 'node_modules', '@img', 'sharp-darwin-arm64')
const BINDING_NODE = join(BINDING_PKG, 'lib', 'sharp-darwin-arm64-0.35.4.node')
const LIBVIPS_PKG = join(
  pnpmDir,
  '@img+sharp-libvips-darwin-arm64@1.3.3',
  'node_modules',
  '@img',
  'sharp-libvips-darwin-arm64'
)

function log(msg) {
  console.log(`[fix-sharp] ${msg}`)
}

// 1. Ensure the 0.35.4 binding exists.
if (!existsSync(BINDING_NODE)) {
  if (!existsSync(TARBALL)) {
    log('vendored tarball missing; skipping (install sharp 0.35.4 binary manually)')
    process.exit(0)
  }
  log('extracting sharp-darwin-arm64@0.35.4 from vendor/')
  const tmp = join(pnpmDir, '.sharp-extract-tmp')
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  execFileSync('tar', ['-xzf', TARBALL, '-C', tmp])
  mkdirSync(dirname(BINDING_PKG), { recursive: true })
  rmSync(BINDING_PKG, { recursive: true, force: true })
  cpSync(join(tmp, 'package'), BINDING_PKG, { recursive: true })
  rmSync(tmp, { recursive: true, force: true })
}

// 2. Link libvips 1.3.3 as a sibling so the binding's @rpath resolves.
const libvipsSibling = join(dirname(BINDING_PKG), 'sharp-libvips-darwin-arm64')
if (existsSync(LIBVIPS_PKG) && !existsSync(libvipsSibling)) {
  symlinkSync(LIBVIPS_PKG, libvipsSibling)
  log('linked sharp-libvips-darwin-arm64@1.3.3')
}

// 3. Repoint every sharp@0.35.4 install to the fixed binding.
let repointed = 0
for (const entry of readdirSync(pnpmDir)) {
  if (!entry.startsWith('sharp@0.35.4')) continue
  const imgDir = join(pnpmDir, entry, 'node_modules', '@img')
  if (!existsSync(imgDir)) continue
  const link = join(imgDir, 'sharp-darwin-arm64')
  try {
    const existing = readlinkSync(link)
    if (existing === BINDING_PKG) continue
  } catch {
    /* link missing — create it below */
  }
  rmSync(link, { recursive: true, force: true })
  symlinkSync(BINDING_PKG, link)
  repointed++
}
if (repointed) log(`repointed ${repointed} sharp@0.35.4 install(s)`)
