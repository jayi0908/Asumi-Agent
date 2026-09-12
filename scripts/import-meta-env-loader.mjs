const ENV = {
  MODE: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  DEV: process.env.NODE_ENV === 'production' ? '' : 'true',
  PROD: process.env.NODE_ENV === 'production' ? 'true' : '',
  MAIN_VITE_CHERRYAI_CLIENT_SECRET: process.env.MAIN_VITE_CHERRYAI_CLIENT_SECRET || '',
  VITE_CHERRYAI_CLIENT_SECRET: process.env.VITE_CHERRYAI_CLIENT_SECRET || ''
}

const PRELUDE = `
import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirnameOf } from 'node:path';
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirnameOf(__filename);
const require = __createRequire(import.meta.url);
if (typeof import.meta.env === 'undefined') {
  Object.defineProperty(import.meta, 'env', { value: ${JSON.stringify(ENV)}, writable: true, configurable: true });
} else {
  Object.assign(import.meta.env, ${JSON.stringify(ENV)});
}
`

export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:')) return nextLoad(url, context)
  if (url.includes('node_modules')) return nextLoad(url, context)
  if (!url.includes('/src/main/') && !url.includes('/src/backend/') && !url.includes('/src/shared/')) {
    return nextLoad(url, context)
  }

  const result = await nextLoad(url, context)
  if (!result || result.format !== 'module' || result.source == null) return result
  const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8')
  if (source.includes('__createRequire') && source.includes('fileURLToPath as __fileURLToPath')) return result
  return {
    format: 'module',
    shortCircuit: true,
    source: PRELUDE + source
  }
}
