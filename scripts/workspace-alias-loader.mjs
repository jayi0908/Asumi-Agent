/**
 * Force Cherry workspace packages to resolve to TypeScript sources under tsx.
 * Avoids broken/partial package `exports` → dist when building via Node.
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const ALIASES = {
  '@cherrystudio/ai-core/built-in/plugins': 'packages/aiCore/src/core/plugins/built-in/index.ts',
  '@cherrystudio/ai-core/provider': 'packages/aiCore/src/core/providers/index.ts',
  '@cherrystudio/ai-core': 'packages/aiCore/src/index.ts',
  '@cherrystudio/ai-sdk-provider': 'packages/ai-sdk-provider/src/index.ts',
  '@cherrystudio/provider-registry/node': 'packages/provider-registry/src/registry-loader.ts',
  '@cherrystudio/provider-registry': 'packages/provider-registry/src/index.ts',
  '@vectorstores/libsql': 'packages/vectorstores/libsql/src/index.ts'
}

export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(ALIASES, specifier)) {
    const abs = path.join(root, ALIASES[specifier])
    return {
      shortCircuit: true,
      url: pathToFileURL(abs).href,
      format: 'module'
    }
  }
  // subpath of ai-core not in map
  if (specifier.startsWith('@cherrystudio/ai-core/')) {
    const rest = specifier.slice('@cherrystudio/ai-core/'.length)
    const candidates = [
      path.join(root, 'packages/aiCore/src', rest + '.ts'),
      path.join(root, 'packages/aiCore/src', rest, 'index.ts'),
      path.join(root, 'packages/aiCore/src/core', rest + '.ts'),
      path.join(root, 'packages/aiCore/src/core', rest, 'index.ts')
    ]
    for (const abs of candidates) {
      try {
        const { accessSync, constants } = await import('node:fs')
        accessSync(abs, constants.R_OK)
        return { shortCircuit: true, url: pathToFileURL(abs).href, format: 'module' }
      } catch {
        /* try next */
      }
    }
  }
  return nextResolve(specifier, context)
}
