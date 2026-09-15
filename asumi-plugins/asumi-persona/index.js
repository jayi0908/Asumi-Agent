import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const persona = readFileSync(join(here, 'persona.md'), 'utf8').trim()

export const name = 'asumi-persona'

export const inject = ['systemPrompt']

export function apply(ctx) {
  // The persona is registered at the persona-prefix position (order 0). The
  // bundle's patch clears the generic coding-agent personaPrefix so that this
  // section is the agent's identity.
  ctx.effect(() =>
    ctx.systemPrompt.section({
      name: 'asumi:persona',
      order: 0,
      text: persona
    })
  )

  // Share identity facts as prompt variables so other Asumi plugins can reuse
  // them (e.g. `{{asumi_name}}`) without importing this module.
  ctx.effect(() => ctx.systemPrompt.variable('asumi_name', () => '錦 あすみ'))

  console.log('[asumi-persona] mounted: 錦 あすみ')
}
