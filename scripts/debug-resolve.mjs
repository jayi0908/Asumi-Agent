export async function resolve(specifier, context, nextResolve) {
  if (specifier.includes('ai-core') || specifier.includes('providerTool') || specifier.includes('built-in')) {
    const r = await nextResolve(specifier, context)
    console.error('[resolve]', specifier, 'from', context.parentURL, '->', r.url)
    return r
  }
  return nextResolve(specifier, context)
}
