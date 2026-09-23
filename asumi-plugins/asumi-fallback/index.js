/**
 * Keep a turn alive when the model route it is on stops answering.
 *
 * The app knows nothing about any particular provider. A route is judged only
 * by what the settings document says about it: one carrying a `baseURL` is
 * treated as reachable-or-not by probing that endpoint, and one that does not
 * (a cloud route the adapter already knows how to reach) is never
 * second-guessed. The fallback is nominated by the user in their own settings
 * section, `asumi.fallbackModel` — never in this package, and deliberately not
 * the deployment default, which is not a stable safe route at all: picking a
 * model for a session writes it there, so the default is simply whatever was
 * chosen last.
 *
 * The work happens on the `agent/request` waterfall, which is where each
 * attempt's provider and model are settled. That placement is what makes the
 * rescue possible: the agent loop re-dispatches it for a retry, so a request
 * that fails on a dead route is retried on the default *inside the same turn*,
 * instead of the turn ending and the next one behaving differently.
 *
 * An earlier version switched the session's model at `agent/pre-step`, which
 * runs after the step's route has already been assembled — it could only fix
 * the next turn, and it needed session-controller internals to do it. Deciding
 * at the request itself is both earlier and narrower: no selection is changed,
 * so the session keeps the model the user chose and the default is untouched.
 *
 * Probes never block a request: the cache is refreshed in the background by a
 * timer and at session start, and a request only ever reads the last answer.
 */

import z from '@deepseek-ai/schemastery'

export const name = 'asumi-fallback'

export const inject = ['llm', 'settings']

/** The user's own settings section, shared with any other Asumi plugin. */
const SETTINGS_NS = 'asumi'

/**
 * A section is only readable once it is registered, so this package registers
 * the one it reads. Both fields are optional: an empty section means "no
 * fallback nominated", which is a valid deployment.
 */
const SETTINGS_SCHEMA = z.object({
  fallbackModel: z.object({
    provider: z.string().required(),
    model: z.string().required()
  })
})

const DEFAULTS = {
  /** How long one probe result is trusted before a refresh is started. */
  probeIntervalMs: 30_000,
  /** How long a probe waits before calling a route unreachable. */
  probeTimeoutMs: 2_000
}

/** The `/models` URL pi-ai's own model discovery would use for a route. */
function modelsUrl(baseUrl) {
  return `${baseUrl.replace(/\/+$/, '')}/models`
}

export function apply(ctx, config = {}) {
  const probeIntervalMs = config.probeIntervalMs ?? DEFAULTS.probeIntervalMs
  const probeTimeoutMs = config.probeTimeoutMs ?? DEFAULTS.probeTimeoutMs

  /** Resolved settings section, replaced whenever the document changes. */
  let settingsSource = () => ({})
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, SETTINGS_NS, SETTINGS_SCHEMA, {}, {
      setSource: (current) => {
        settingsSource = current
      },
      onChange: () => {}
    })
  })

  /** Last answer per route, probes in flight, and turns already rescued. */
  const probes = new Map()
  const probing = new Set()
  const rescued = new Set()
  const agents = new Map()

  /**
   * The route the user nominated as the fallback, or undefined.
   *
   * Their own section rather than this package's config: a fallback is a
   * deployment's decision about its own routes, and the settings document is
   * the only place that knows which routes exist. Nothing is assumed when it
   * is absent — the plugin simply has no opinion.
   */
  function fallbackSelection() {
    const picked = settingsSource()?.fallbackModel
    if (!picked?.provider || !picked.model) return undefined
    return picked
  }

  /**
   * The configured endpoint of a route, read from the settings document.
   *
   * The route's own directory entry says where its profile lives (`settingsNs`
   * plus `settingsPath`), which keeps this working for a hand-declared gateway
   * and for a catalog route alike. A route with no endpoint is a cloud route
   * the adapter reaches on its own, and there is nothing to probe.
   */
  function baseUrlOf(provider) {
    const route = (ctx.llm.listConfigurableProviders() ?? []).find(
      (entry) => entry.provider === provider
    )
    if (!route) return undefined

    let node = ctx.settings.get(route.settingsNs)
    for (const key of route.settingsPath ?? []) node = node?.[key]
    return node?.baseURL
  }

  /**
   * The last known answer for a route.
   *
   * Reachability is the question, not health: an endpoint answering 401 or 403
   * is running, and a real request would have got further than a refusal to
   * connect. A route never probed is assumed usable — the first request on it
   * is the probe.
   */
  function lastKnown(provider) {
    return probes.get(provider)?.up ?? true
  }

  /** Probe one route, unless a fresh answer is already in hand. */
  function refresh(provider, force = false) {
    if (!baseUrlOf(provider) || probing.has(provider)) return
    const cached = probes.get(provider)
    if (!force && cached !== undefined && Date.now() - cached.at < probeIntervalMs) return

    probing.add(provider)
    const attempt = async () => {
      let up
      try {
        const response = await fetch(modelsUrl(baseUrlOf(provider)), {
          signal: AbortSignal.timeout(probeTimeoutMs)
        })
        up = response.ok || response.status === 401 || response.status === 403
      } catch {
        up = false
      }
      if (cached?.up !== undefined && cached.up !== up) {
        console.log(
          `[asumi-fallback] route "${provider}" is now ${up ? 'reachable' : 'unreachable'}`
        )
      }
      probes.set(provider, { at: Date.now(), up })
      probing.delete(provider)
    }
    // Fire and forget: a request must never wait on a probe.
    attempt().catch(() => probing.delete(provider))
  }

  /**
   * The route a session last sent a request on, when it has.
   *
   * A session that has not sent one has no route to warm; its first request
   * carries its own answer.
   */
  function routeOf(agent) {
    const header = agent.session.requestHeader()?.config
    return header?.provider && header.model ? header : undefined
  }

  // ── the decision, made per attempt ────────────────────────────────────────
  const offRequest = ctx.on('agent/request', async (payload, next) => {
    const resolved = await next()

    const fallback = fallbackSelection()
    if (fallback === undefined) return resolved
    // Already on the fallback: there is nothing safer to move to.
    if (resolved.provider === fallback.provider) return resolved
    // A route with no endpoint of its own is not ours to judge.
    if (!baseUrlOf(resolved.provider)) return resolved

    // Keep the answer fresh for next time, then decide on the last one.
    refresh(resolved.provider)
    if (lastKnown(resolved.provider)) return resolved

    console.log(
      `[asumi-fallback] route "${resolved.provider}" is unreachable; ` +
        `using the default ${fallback.provider}/${fallback.model}`
    )
    // Only provider and model: the other fields were resolved for the route
    // being left behind, and the new route's own defaults should apply.
    return { provider: fallback.provider, model: fallback.model }
  })

  // ── remember a failure, and ask for one retry on the default ──────────────
  const offError = ctx.on('agent/request-error', async (payload, next) => {
    const decision = await next()
    if (payload.signal?.aborted) return decision

    const fallback = fallbackSelection()
    if (fallback === undefined || payload.provider === fallback.provider) return decision
    if (!baseUrlOf(payload.provider)) return decision

    // The route just failed for real, which outranks the last probe. Marking it
    // here is what makes the retry — which re-dispatches `agent/request` —
    // leave the dead route immediately instead of exhausting the retry budget.
    probes.set(payload.provider, { at: Date.now(), up: false })
    console.warn(
      `[asumi-fallback] route "${payload.provider}" failed ` +
        `(${payload.failure?.code ?? 'unknown'})`
    )

    // A retry policy that still has budget owns the retry; the rewrite applies
    // to whatever it dispatches next.
    if (decision !== undefined) return decision

    const key = `${payload.agent.session.id}:${payload.turn}`
    if (rescued.has(key)) return decision
    if (rescued.size > 500) rescued.clear()
    rescued.add(key)
    console.log('[asumi-fallback] retrying this step on the default')
    return { kind: 'retry' }
  })

  // ── background warming, so a request never has to probe ───────────────────
  const offStart = ctx.on('agent/session-start', (payload) => {
    agents.set(payload.agent.session.id, payload.agent)
    const route = routeOf(payload.agent)
    if (route?.provider) refresh(route.provider)
  })

  const offDisposed = ctx.on('agent/disposed', (payload) => {
    agents.delete(payload.agent.session.id)
  })

  const timer = setInterval(() => {
    for (const agent of agents.values()) {
      const route = routeOf(agent)
      if (route?.provider) refresh(route.provider)
    }
  }, probeIntervalMs)

  ctx.effect(
    () => () => {
      clearInterval(timer)
      offRequest()
      offError()
      offStart()
      offDisposed()
    },
    'asumi-fallback: stop watching'
  )

  const nominated = fallbackSelection()
  console.log(
    nominated === undefined
      ? `[asumi-fallback] mounted, but no fallback is nominated — set asumi.fallbackModel in ` +
          `the settings document to enable it (probing every ${probeIntervalMs}ms)`
      : `[asumi-fallback] mounted (fallback ${nominated.provider}/${nominated.model}, ` +
          `probe every ${probeIntervalMs}ms)`
  )
}
