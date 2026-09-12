import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let upd
try {
  upd = require('electron-updater-cjs-real')
} catch {
  upd = {
    autoUpdater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      logger: null,
      setFeedURL: () => {},
      checkForUpdates: async () => null,
      checkForUpdatesAndNotify: async () => null,
      quitAndInstall: () => {},
      on: () => {},
      once: () => {},
      removeListener: () => {},
      removeAllListeners: () => {}
    }
  }
}

export const autoUpdater = upd.autoUpdater ?? upd
export default { autoUpdater }
