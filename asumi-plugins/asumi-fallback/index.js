/**
 * Model fallback: keep working when the primary model's server is unavailable.
 *
 * The primary here is a self-hosted model (a local llama.cpp / vLLM / sglang
 * box). While it is not running, a turn that starts on it cannot be rescued:
 * the built-in retry re-tries the same endpoint, and the agent loop fixes a
 * step's route when it assembles the prompt — which happens *before* the
 * `agent/pre-step` hook, so changing the session's selection during a turn only
 * affects a later one.
 *
 * The route is therefore chosen while nothing is in flight: a session is
 * aligned when it is created, and re-aligned on a timer. By the time the user
 * sends a message, an unreachable primary has already been swapped out, so the
 * turn runs on the fallback from its first request rather than failing first.
 *
 * Three properties matter:
 *
 *  * **Per session, not the deployment default.** The switch goes through the
 *    session's model selection, so a future session still starts on the
 *    primary. Saving the fallback as the default would quietly make it
 *    permanent — including after the primary recovers.
 *  * **One probe per interval.** Aligning happens for every known session; the
 *    probe result is shared, so a poll of ten sessions costs one request.
 *  * **The user's choice wins.** The plugin switches away only while the
 *    primary is unreachable, and switches back only for sessions it moved
 *    itself; a model picked by hand is never overridden.
 */

export const name = 'asumi-fallback'

export const inject = ['llm', 'settings', 'sessionController', 'agentDefaultModel']

const DEFAULTS = {
  /** The route whose availability decides the fallback. */
  primary: { provider: 'qwen3-8' },
  /** The route used while the primary is unreachable. */
  fallback: { provider: 'deepseek-official', model: 'deepseek-flash' },
  /** How often the primary is re-checked, and how long one result is trusted. */
  probeIntervalMs: 30_000,
  /** How long a probe waits before calling the primary unreachable. */
  probeTimeoutMs: 2_000
}

/** The `/models` URL pi-ai's own model discovery would use for a route. */
function modelsUrl(baseUrl) {
  return `${baseUrl.replace(/\/+$/, '')}/models`
}

export function apply(ctx, config = {}) {
  const primary = { ...DEFAULTS.primary, ...(config.primary ?? {}) }
  const fallback = { ...DEFAULTS.fallback, ...(config.fallback ?? {}) }
  const probeIntervalMs = config.probeIntervalMs ?? DEFAULTS.probeIntervalMs
  const probeTimeoutMs = config.probeTimeoutMs ?? DEFAULTS.probeTimeoutMs

  /** When the cached probe result was taken, and what it said. */
  let checkedAt = 0
  let primaryUp = true
  /** Live agents by session. */
  const agents = new Map()
  /** Each moved session's original selection, so the return trip is exact. */
  const moved = new Map()

  /**
   * The configured endpoint of a route, read from the settings document.
   *
   * The route's directory entry says where its profile lives (`settingsNs` plus
   * `settingsPath`), which keeps this working for a hand-declared gateway and
   * for a catalog route alike.
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
   * Whether the primary route answers at all.
   *
   * Reachability is the question, not health: an endpoint answering 401 or 403
   * is running, and a real request would have got further than a refusal to
   * connect. A route with no baseURL (a cloud route, say) is never judged
   * unreachable — there is nothing to probe and no reason to doubt it.
   */
  async function reachable(provider) {
    const baseUrl = baseUrlOf(provider)
    if (!baseUrl) return true
    try {
      const response = await fetch(modelsUrl(baseUrl), {
        signal: AbortSignal.timeout(probeTimeoutMs)
      })
      return response.ok || response.status === 401 || response.status === 403
    } catch {
      return false
    }
  }

  /**
   * Select the model for one session's next request.
   *
   * This is the session-local operation the model picker performs, minus its
   * "and remember this as the deployment default" half. The plugin moves one
   * session; the user's default has to survive it, or the fallback becomes
   * permanent and there is nothing left to return to. DSH exposes no Remote
   * for that half — the agent registry is reached directly, and the plugin
   * says so loudly if a future version moves it.
   */
  function select(agent, selection) {
    const registry = ctx.sessionController?.agents
    if (typeof registry?.selectForNextRequest !== 'function') {
      throw new Error(
        'sessionController.agents.selectForNextRequest is unavailable; the plugin cannot switch models'
      )
    }
    registry.selectForNextRequest(agent, selection)
  }

  /** Whether the cached answer still stands, refreshing it when it is stale. */
  async function isPrimaryUp() {
    const now = Date.now()
    if (now - checkedAt >= probeIntervalMs) {
      checkedAt = now
      const wasUp = primaryUp
      primaryUp = await reachable(primary.provider)
      // Only transitions are worth a line: the probe runs on a timer forever.
      if (primaryUp !== wasUp) {
        console.log(
          `[asumi-fallback] ${primary.provider} is now ${primaryUp ? 'reachable' : 'unreachable'}`
        )
      }
    }
    return primaryUp
  }

  /** Point one session at whichever route is usable right now. */
  async function align(agent) {
    const sessionId = agent.session.id

    if (!(await isPrimaryUp())) {
      if (moved.has(sessionId)) return
      // Remember where this session was, then pin the deployment default back:
      // whatever it was, the fallback must not become it.
      const from = ctx.agentDefaultModel.currentSelection()
      moved.set(sessionId, from)
      select(agent, { provider: fallback.provider, model: fallback.model })
      if (from !== undefined) {
        try {
          await ctx.agentDefaultModel.saveSelection(from)
        } catch (error) {
          console.warn(
            `[asumi-fallback] could not keep the default model at ${from.provider}/${from.model}: ${error?.message ?? error}`
          )
        }
      }
      console.log(
        `[asumi-fallback] ${primary.provider} is unreachable; using ${fallback.provider}/${fallback.model}` +
          (from === undefined ? ' (no default recorded to return to)' : '')
      )
      return
    }

    // The primary answers: undo only a move this plugin made.
    if (!moved.has(sessionId)) return
    const from = moved.get(sessionId)
    moved.delete(sessionId)

    // A session whose original selection was never recorded falls back to the
    // configured primary model, when the deployment names one.
    const target =
      from ?? (primary.model === undefined ? undefined : { provider: primary.provider, model: primary.model })
    if (target === undefined) return

    select(agent, target)
    console.log(
      `[asumi-fallback] ${primary.provider} is back; returning to ${target.provider}/${target.model}`
    )
  }

  /** Align one agent without ever letting bookkeeping break a turn. */
  async function alignQuietly(agent) {
    try {
      await align(agent)
    } catch (error) {
      console.warn(`[asumi-fallback] could not align the model: ${error?.message ?? error}`)
    }
  }

  // The session lifecycle begins once before the first turn, which is early
  // enough that the turn's own prompt assembly — and so its first request —
  // already sees the alignment.
  const offStart = ctx.on('agent/session-start', (payload) => {
    agents.set(payload.agent.session.id, payload.agent)
    return alignQuietly(payload.agent)
  })

  // A cheap second chance on the turn path; the probe result is cached, so this
  // is a map lookup for all but one step per interval.
  const offStep = ctx.on('agent/pre-step', async (payload, next) => {
    agents.set(payload.agent.session.id, payload.agent)
    await alignQuietly(payload.agent)
    return next()
  })

  const offDisposed = ctx.on('agent/disposed', (payload) => {
    const sessionId = payload.agent.session.id
    agents.delete(sessionId)
    moved.delete(sessionId)
  })

  // Re-check while the app idles, so a primary that goes down (or comes back)
  // between turns is noticed before the user's next message.
  const timer = setInterval(() => {
    for (const agent of agents.values()) alignQuietly(agent)
  }, probeIntervalMs)

  // Backstop for a primary that passes the probe but fails a real request. The
  // failing turn still fails — its retry reuses the recorded route — so this
  // exists to make the next request start on the fallback.
  const offError = ctx.on('agent/request-error', async (payload, next) => {
    const decision = await next()
    if (decision !== undefined) return decision
    if (payload.signal?.aborted) return undefined
    if (payload.provider !== primary.provider) return undefined

    console.warn(
      `[asumi-fallback] ${primary.provider} failed (${payload.failure?.code ?? 'unknown'}); ` +
        `the next request will use ${fallback.provider}/${fallback.model}`
    )
    // Trust this over the cached probe until the next interval re-checks.
    checkedAt = Date.now()
    primaryUp = false
    return undefined
  })

  ctx.effect(
    () => () => {
      clearInterval(timer)
      offStart()
      offStep()
      offDisposed()
      offError()
    },
    'asumi-fallback: stop watching'
  )

  if (baseUrlOf(primary.provider)) {
    console.log(
      `[asumi-fallback] mounted (primary ${primary.provider}, fallback ${fallback.provider}/${fallback.model}, ` +
        `probe every ${probeIntervalMs}ms)`
    )
  } else {
    console.warn(
      `[asumi-fallback] no endpoint for "${primary.provider}" in settings; treating it as available`
    )
  }
}
