function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Read plain text from the system clipboard.
 *
 * WKWebView (Tauri/macOS) rejects `navigator.clipboard.readText()` when the
 * call carries no user gesture — e.g. Quick Assistant reads the clipboard on
 * window show. Fall back to the native clipboard plugin in that case, keeping
 * the web path first so browser-only dev mode still behaves as before.
 *
 * The plugin is imported lazily so it stays out of the initial module graph
 * (and never loads in a plain browser).
 */
export async function readClipboardText(): Promise<string> {
  try {
    return await navigator.clipboard.readText()
  } catch (error) {
    if (isTauriRuntime()) {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
      return await readText()
    }
    throw error
  }
}
