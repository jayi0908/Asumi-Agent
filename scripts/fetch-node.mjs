#!/usr/bin/env node
/**
 * Fetch the Node runtime the app ships as a Tauri sidecar.
 *
 * The harness is a Node application, so a self-contained Asumi Agent carries
 * its own interpreter: bundled Node means the user installs nothing. Tauri
 * expects a sidecar at `src-tauri/binaries/<name>-<target-triple>`, and strips
 * the triple when bundling.
 *
 * Downloads are cached under `src-tauri/.cache`, so repeated builds are free.
 *
 * Usage:
 *   node scripts/fetch-node.mjs [--target <triple>]... [--force]
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const binariesDir = join(root, 'src-tauri/binaries')
const cacheDir = join(root, 'src-tauri/.cache')

/**
 * The Node release to bundle.
 *
 * Pinned rather than floating: the engine's native addons (koffi, node-pty)
 * are built against one ABI, and a silent major bump would ship a runtime the
 * prebuilt artifacts do not match.
 */
const NODE_VERSION = process.env.ASUMI_NODE_VERSION || 'v24.11.1'

/** Tauri target triple -> the architecture name Node's dist uses. */
const ARCH_BY_TRIPLE = {
  'aarch64-apple-darwin': 'arm64',
  'x86_64-apple-darwin': 'x64'
}

function parseArgs(argv) {
  const targets = []
  let force = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target') targets.push(argv[++i])
    else if (argv[i] === '--force') force = true
  }
  return { targets, force }
}

/**
 * The host triple by default: a local build only needs the interpreter it will
 * run. Releases pass every target explicitly so one build serves each arch.
 */
function defaultTargets() {
  if (process.platform !== 'darwin') {
    throw new Error('only macOS targets are wired; pass --target explicitly')
  }
  return [process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin']
}

/**
 * Download with resume.
 *
 * The dist server can drop a stream mid-transfer (HTTP/2 stream errors behind
 * some proxies); `-C -` plus retries turns that into a resumed transfer
 * instead of a failed build.
 */
function download(url, destination) {
  const args = [
    '-fSL',
    '--http1.1',
    '-C',
    '-',
    '--retry',
    '5',
    '--retry-all-errors',
    '--retry-delay',
    '3',
    '-o',
    destination,
    url
  ]
  execFileSync('curl', args, { stdio: ['ignore', 'inherit', 'inherit'] })
}

/**
 * A local interpreter to reuse instead of downloading.
 *
 * The harness's native addons (koffi, node-pty) were built against the ABI of
 * the Node that ran `pnpm install`, so bundling that same interpreter is both
 * correct and free. It is only reused for the host architecture; a
 * cross-target build always downloads.
 */
function localInterpreter(triple) {
  const override = process.env.ASUMI_NODE_BIN
  if (override) return override

  const hostTriple = process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
  if (triple !== hostTriple) return undefined

  const version = execFileSync(process.execPath, ['--version'], { encoding: 'utf8' }).trim()
  return version === NODE_VERSION ? process.execPath : undefined
}

function main() {
  const { targets: requested, force } = parseArgs(process.argv.slice(2))
  const targets = requested.length ? requested : defaultTargets()
  mkdirSync(binariesDir, { recursive: true })
  mkdirSync(cacheDir, { recursive: true })

  for (const triple of targets) {
    const arch = ARCH_BY_TRIPLE[triple]
    if (!arch) throw new Error(`unsupported target triple: ${triple}`)

    const destination = join(binariesDir, `node-${triple}`)
    if (existsSync(destination) && !force) {
      const version = execFileSync(destination, ['--version'], { encoding: 'utf8' }).trim()
      console.log(`[fetch-node] ${triple}: ${version} (cached)`)
      continue
    }

    const local = localInterpreter(triple)
    if (local) {
      copyFileSync(local, destination)
      chmodSync(destination, 0o755)
      console.log(`[fetch-node] ${triple}: reused ${local} (${NODE_VERSION})`)
      continue
    }

    const tarball = join(cacheDir, `node-${NODE_VERSION}-darwin-${arch}.tar.gz`)
    if (!existsSync(tarball) || force) {
      const url = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-${arch}.tar.gz`
      console.log(`[fetch-node] downloading ${url}`)
      const partial = `${tarball}.partial`
      rmSync(partial, { force: true })
      download(url, partial)
      renameSync(partial, tarball)
    }

    // Extract only the interpreter; the npm/pnpm shims and headers would add
    // tens of megabytes to the bundle for nothing.
    const staging = join(cacheDir, `extract-${triple}`)
    rmSync(staging, { recursive: true, force: true })
    mkdirSync(staging, { recursive: true })
    execFileSync(
      'tar',
      [
        '-xzf',
        tarball,
        '-C',
        staging,
        '--strip-components=2',
        `node-${NODE_VERSION}-darwin-${arch}/bin/node`
      ],
      { stdio: 'inherit' }
    )

    copyFileSync(join(staging, 'node'), destination)
    chmodSync(destination, 0o755)
    rmSync(staging, { recursive: true, force: true })

    // Tauri ad-hoc signs the sidecar; verify it runs before it is bundled.
    const version = execFileSync(destination, ['--version'], { encoding: 'utf8' }).trim()
    console.log(`[fetch-node] ${triple}: ${version} -> ${destination}`)
  }
}

main()
