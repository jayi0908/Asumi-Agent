/**
 * Start Cherry main lifecycle under electron-shim.
 */
import { application, serviceList } from '@application'
import { app } from 'electron'

export async function startCherryMain(): Promise<void> {
  await import('@main/data/bootConfig')

  try {
    const { resolveUserDataLocation } = await import('@main/core/preboot/userDataLocation')
    resolveUserDataLocation()
  } catch (error) {
    console.warn('[cherry-backend] resolveUserDataLocation failed', error)
  }

  application.initPathRegistry()
  application.registerAll(serviceList)
  console.log('[cherry-backend] services registered', Object.keys(serviceList as object).length)

  const bootstrapPromise = application.bootstrap()
  await app.whenReady()
  await bootstrapPromise
  console.log('[cherry-backend] bootstrap complete')

  try {
    const { registerIpc } = await import('@main/ipc')
    await registerIpc()
  } catch (error) {
    console.warn('[cherry-backend] registerIpc partial failure (electron deps)', (error as Error).message)
  }

  try {
    const { versionService } = await import('@main/services/VersionService')
    versionService.recordCurrentVersion()
  } catch { /* optional */ }
}
