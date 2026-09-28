/**
 * Regenerate surface plugin, node half.
 *
 * Pure UI plugin: the empty apply exists so the package is an enabled Loader
 * entry in the host tree, which is what makes client-modules discover and serve
 * its browser half. The browser half ships via `exports["./client"]`, found
 * through the `dsh.client` declaration in package.json.
 */
export function apply() {}
