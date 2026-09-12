import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react-swc'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const repoRoot = __dirname
const rendererRoot = resolve(repoRoot, 'src/renderer')

/**
 * Renderer Vite config: Cherry multi-window HTML entries + path aliases.
 * Platform bridge is imported from each window entryPoint (see install).
 */
export default defineConfig({
  root: rendererRoot,
  publicDir: resolve(repoRoot, 'resources'),
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: resolve(rendererRoot, 'routes'),
      generatedRouteTree: resolve(rendererRoot, 'routeTree.gen.ts')
    }),
    tailwindcss(),
    react({ tsDecorators: true })
  ],
  resolve: {
    alias: {
      '@renderer': rendererRoot,
      '@shared': resolve(repoRoot, 'src/shared'),
      '@types': resolve(rendererRoot, 'types'),
      '@logger': resolve(rendererRoot, 'services/LoggerService'),
      '@data': resolve(rendererRoot, 'data'),
      '@bridge': resolve(repoRoot, 'src/bridge'),
      '@mcp-trace/trace-core': resolve(repoRoot, 'packages/mcp-trace/trace-core'),
      '@cherrystudio/ai-core/provider': resolve(repoRoot, 'packages/aiCore/src/core/providers'),
      '@cherrystudio/ai-core/built-in/plugins': resolve(repoRoot, 'packages/aiCore/src/core/plugins/built-in'),
      '@cherrystudio/ai-core': resolve(repoRoot, 'packages/aiCore/src'),
      '@cherrystudio/extension-table-plus': resolve(repoRoot, 'packages/extension-table-plus/src'),
      '@cherrystudio/ai-sdk-provider': resolve(repoRoot, 'packages/ai-sdk-provider/src'),
      '@cherrystudio/provider-registry/node': resolve(repoRoot, 'packages/provider-registry/src/registry-loader'),
      '@cherrystudio/provider-registry': resolve(repoRoot, 'packages/provider-registry/src'),
      '@cherrystudio/ui/icons': resolve(repoRoot, 'packages/ui/src/components/icons'),
      '@cherrystudio/ui': resolve(repoRoot, 'packages/ui/src')
    }
  },
  optimizeDeps: {
    exclude: ['pyodide'],
    esbuildOptions: { target: 'esnext' }
  },
  worker: { format: 'es' },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "0.0.0.0"
  },
  build: {
    target: 'esnext',
    outDir: resolve(repoRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(rendererRoot, 'windows/main/index.html'),
        settings: resolve(rendererRoot, 'windows/settings/index.html'),
        quickAssistant: resolve(rendererRoot, 'windows/quickAssistant/index.html'),
        selectionToolbar: resolve(rendererRoot, 'windows/selection/toolbar/index.html'),
        selectionAction: resolve(rendererRoot, 'windows/selection/action/index.html'),
        migrationV2: resolve(rendererRoot, 'windows/migrationV2/index.html'),
        subWindow: resolve(rendererRoot, 'windows/subWindow/index.html')
      }
    }
  }
})
