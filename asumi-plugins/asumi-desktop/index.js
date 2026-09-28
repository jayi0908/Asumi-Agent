import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { Service } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

const DEFAULT_PORT = 3099
const DEFAULT_TIMEOUT_MS = 20_000

/**
 * The expressions Asumi can wear, named so the model can pick one.
 *
 * They mirror the game's expression diffs (`fa/`… `b0051`): the shell maps the
 * name to that face and the pet draws it. The voice has one timbre, so this is
 * expression alone.
 */
const EMOTIONS = [
  'default',
  'doubt',
  'serious',
  'helpless',
  'confident',
  'reproach',
  'surprised',
  'glad',
  'pout',
  'sad',
  'sigh',
  'relieved',
  'angry',
  'agitated',
  'stunned',
  'grin',
  'embarrassed',
  'cry',
  'disgust',
  'excited'
]

const EMOTION_LABELS =
  'default 平静、doubt 疑惑、serious 认真、helpless 无奈、confident 自信、' +
  'reproach 责备、surprised 惊讶、glad 欣慰、pout 嗔怪、sad 伤心、sigh 叹气、' +
  'relieved 安心、angry 生气、agitated 激动、stunned 惊呆、grin 傻笑、' +
  'embarrassed 窘迫、cry 急哭、disgust 嫌弃、excited 兴奋'

/**
 * How much Japanese a reply may be spoken without `/asumi` forcing it.
 *
 * The model is told to speak only short, conversational replies; this is the
 * backstop for when it ignores that and hands over an explanation to read out.
 */
const SPOKEN_CAP = 150

function resolveDshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * Line-delimited JSON bridge to the Tauri shell.
 *
 * The agent side is the server: the Tauri shell connects once at startup to
 * receive desktop commands (speak, pet state, notifications, screen capture)
 * and to answer the ones that need a result. Frames are newline-delimited and
 * buffered per socket, because a screen-capture reply is far larger than one
 * TCP read. When nothing is connected the bridge stays in detached mode so the
 * agent never blocks on the desktop being absent.
 */
function createBridge() {
  const port = Number(process.env.ASUMI_DESKTOP_PORT || DEFAULT_PORT)
  const clients = new Set()
  const pending = new Map()
  let ready = false
  let nextRequest = 0

  function settle(message) {
    const entry = pending.get(message.requestId)
    if (!entry) return
    pending.delete(message.requestId)
    clearTimeout(entry.timer)
    if (message.ok === false) entry.reject(new Error(message.error || 'desktop request failed'))
    else entry.resolve(message)
  }

  function consume(socket, chunk) {
    socket.buffer += chunk
    let index
    while ((index = socket.buffer.indexOf('\n')) >= 0) {
      const line = socket.buffer.slice(0, index)
      socket.buffer = socket.buffer.slice(index + 1)
      if (!line.trim()) continue
      try {
        const message = JSON.parse(line)
        if (message.type === 'capture-screen-result') settle(message)
        else console.log('[asumi-desktop] inbound', message.type)
      } catch {
        console.warn('[asumi-desktop] dropping malformed frame')
      }
    }
  }

  const server = createServer((socket) => {
    socket.buffer = ''
    socket.setEncoding('utf8')
    clients.add(socket)
    socket.on('data', (chunk) => consume(socket, chunk))
    socket.on('close', () => clients.delete(socket))
    socket.on('error', () => clients.delete(socket))
  })

  server.on('error', (error) => {
    console.warn(`[asumi-desktop] bridge listen failed (${error.message}); detached`)
  })

  try {
    server.listen(port, '127.0.0.1', () => {
      ready = true
      try {
        const home = resolveDshHome()
        mkdirSync(home, { recursive: true })
        writeFileSync(
          join(home, 'asumi-desktop.json'),
          JSON.stringify({ port, pid: process.pid, startedAt: Date.now() }, null, 2)
        )
      } catch {
        /* port file is best-effort */
      }
      console.log(`[asumi-desktop] bridge listening on 127.0.0.1:${port}`)
    })
  } catch (error) {
    console.warn('[asumi-desktop] bridge start failed:', error.message)
  }

  function send(message) {
    const line = `${JSON.stringify(message)}\n`
    let delivered = 0
    for (const socket of clients) {
      try {
        socket.write(line)
        delivered++
      } catch {
        clients.delete(socket)
      }
    }
    if (delivered === 0) console.log('[asumi-desktop] (detached)', JSON.stringify(message))
    return delivered
  }

  /** Send a command and await the matching `capture-screen-result`-style reply. */
  function request(message, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const requestId = `asumi-${++nextRequest}`
    if (send({ ...message, requestId }) === 0) {
      return Promise.reject(new Error('desktop 未连接，无法完成这个操作'))
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error('桌面响应超时'))
      }, timeoutMs)
      pending.set(requestId, { resolve, reject, timer })
    })
  }

  function close() {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new Error('desktop bridge closed'))
    }
    pending.clear()
    try {
      server.close()
    } catch {
      /* already closed */
    }
    for (const socket of clients) {
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
    }
    clients.clear()
  }

  return { send, request, close, port, isReady: () => ready, clientCount: () => clients.size }
}

export const name = 'asumi-desktop'

export const inject = ['tools', 'attachments']

export function apply(ctx) {
  const bridge = createBridge()
  ctx.effect(() => () => bridge.close())

  // Sessions that asked for speech regardless of length, via `/asumi`.
  const forced = new Set()
  const sessionIdOf = (agent) => {
    const header = agent && agent.session && agent.session.header
    return (header && header.id) || undefined
  }

  // The force flag rides the prompt: when it is set, the model is told it must
  // speak, whatever it is answering. Registered through `ctx.inject` so a
  // composition without those services (a headless run) still loads this plugin.
  ctx.inject(['systemPrompt'], (scope) => {
    scope.effect(() =>
      scope.systemPrompt.section({
        name: 'asumi:force-speak',
        order: 60,
        text: ({ agent }) => {
          const id = sessionIdOf(agent)
          return id && forced.has(id)
            ? '先輩这一次明确要求出声（用了 `/asumi`）：无论内容长短都必须调用 `asumi_say` 出声；' +
                '内容长的话，用几句短句概括核心即可，不要求逐字等于正文。'
            : ''
        }
      })
    )
  })

  ctx.inject(['commands'], (scope) => {
    scope.effect(() =>
      scope.commands.register({
        name: 'asumi',
        description: '切换「强制出声」：打开后每次回答都会让桌宠出声，直到再关掉',
        input: { hint: 'on / off（省略即切换）' },
        handler: ({ agent, rawInput }) => {
          const id = sessionIdOf(agent)
          if (id === undefined) {
            return { kind: 'error', text: '当前没有会话，无法设置。' }
          }
          const argument = String(rawInput || '').trim().toLowerCase()
          const next = argument === 'on' ? true : argument === 'off' ? false : !forced.has(id)
          if (next) forced.add(id)
          else forced.delete(id)
          return {
            kind: 'success',
            text: next
              ? '强制出声已打开：之后每次回答都会出声（用 /asumi off 关掉）'
              : '强制出声已关闭：回到按内容决定是否出声'
          }
        }
      })
    )
  })

  /** `ctx.asumiDesktop` — desktop capabilities for Asumi plugins and tools. */
  class AsumiDesktop extends Service {
    constructor(parent) {
      super(parent, 'asumiDesktop')
    }

    /**
     * Say one bilingual line: `ja` is voiced, and both halves are displayed.
     *
     * Two fields rather than one line of mixed prose: the voice model is
     * Japanese-only, so the language of its input has to be a fact of the
     * interface instead of something the shell guesses at.
     */
    say(ja, zh, options = {}) {
      return bridge.send({ type: 'say', ja, zh, ...options })
    }

    /** Update the pet window's mood/expression. */
    setPetState(state) {
      return bridge.send({ type: 'pet-state', state })
    }

    /** Switch presence: `always` (常驻), `ghost` (透明), or `hidden`. */
    setPetMode(mode) {
      return bridge.send({ type: 'pet-mode', mode })
    }

    /** Play a bundled audio asset by name. */
    playAudio(name) {
      return bridge.send({ type: 'audio', name })
    }

    /** Raise a desktop notification. */
    notify(title, body) {
      return bridge.send({ type: 'notify', title, body })
    }

    /**
     * Grab a screen frame. Resolves with `{ mediaType, data, width, height }`
     * where `data` is base64; rejects when no desktop is connected.
     */
    captureScreen(options = {}) {
      return bridge.request({ type: 'capture-screen', ...options })
    }

    /** Whether a desktop client is currently connected. */
    get connected() {
      return bridge.clientCount() > 0
    }
  }

  ctx.plugin(AsumiDesktop)

  ctx.effect(() =>
    ctx.tools.register(
      defineTool({
        name: 'asumi_say',
        description:
          '对先輩说话。**只接受 `lines` 数组**（不要用顶层的 `ja` / `zh`，那是旧格式）：' +
          '把要说的内容拆成若干句短台词，每句一个 `{ ja, zh, emotion }` —— `ja` 是要朗读的日语（纯日语），' +
          '`zh` 是这句的中文（和正文对应），`emotion` 是这句的表情（**逐句给**，只换表情、不变嗓音）：' +
          EMOTION_LABELS +
          '。她会一句一句地念出来（像 galgame 逐句播放），句与句之间停顿约两秒。' +
          '方便朗读时才用它 —— 只写中文不会发出声音。',
        parameters: {
          lines: {
            type: 'array',
            description:
              '这次要说的台词，按播放顺序排列；每句一个 `{ ja, zh, emotion }`，尽量短（≤ 30 字），最多 6 句',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                ja: {
                  type: 'string',
                  required: true,
                  description: '这句要朗读的日语，纯日语，不要混中文'
                },
                zh: {
                  type: 'string',
                  required: true,
                  description: '这句的中文，和正文对应，作为桌宠字幕'
                },
                emotion: {
                  type: 'string',
                  enum: EMOTIONS,
                  description: '这句的表情（逐句给）：' + EMOTION_LABELS
                }
              }
            }
          },
          emotion: {
            type: 'string',
            enum: EMOTIONS,
            description: '（可选）某句没写 emotion 时用它当默认：' + EMOTION_LABELS
          }
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }]
        },
        execute(args, exec) {
          const rows = Array.isArray(args.lines) ? args.lines : []
          if (rows.length === 0 && (args.ja || args.zh)) {
            // The array is the only accepted shape. A conversation that predates
            // it makes the model imitate `{ ja, zh }`, so ask again instead of
            // quietly playing one long run-on line.
            return (
              '格式不对：`asumi_say` 只接受 `lines` 数组。请把要说的内容拆成若干短句，' +
              '用 `lines` 重新调用一次，每句形如 `{ "ja": …, "zh": …, "emotion": … }`；' +
              '不要使用顶层的 `ja` / `zh`。'
            )
          }
          const fallback = EMOTIONS.includes(args.emotion) ? args.emotion : 'default'
          const lines = rows
            .map((line) => ({
              ja: String((line && line.ja) || '').trim(),
              zh: String((line && line.zh) || '').trim(),
              emotion: EMOTIONS.includes(line && line.emotion) ? line.emotion : fallback
            }))
            .filter((line) => line.ja !== '' || line.zh !== '')
          if (lines.length === 0) {
            return '没有可说的内容：请用 `lines` 给出至少 1 句 `{ ja, zh, emotion }`。'
          }

          // Long explanations are for reading, not for listening to: unless the
          // session asked for speech, refuse the line and say so.
          const spoken = lines.reduce((total, line) => total + line.ja.length, 0)
          const askedToSpeak = forced.has(sessionIdOf(exec && exec.agent))
          if (!askedToSpeak && spoken > SPOKEN_CAP) {
            return (
              `这段话有 ${String(spoken)} 字，按设定这种解释不出声，写在正文里就好。` +
              '如果先輩明确要求出声，可以用 `/asumi` 打开强制出声。'
            )
          }

          const delivered = bridge.send({ type: 'say', lines })
          const said = lines.map((line) => line.zh).filter((zh) => zh !== '').join('')
          return delivered > 0
            ? `已对先輩说（${lines.length} 句）：${said}`
            : `桌面未连接，暂存了（${lines.length} 句）：${said}`
        }
      })
    )
  )

  ctx.effect(() =>
    ctx.tools.register(
      defineTool({
        name: 'asumi_presence',
        description:
          '切换あすみ在桌面上的存在方式。always：常驻，一直留在屏幕上；ghost：透明，只在开口时短暂出现；hidden：暂时从桌面消失。先輩说「先别出来」「安静一点」时用 ghost 或 hidden，说「出来吧」时用 always。',
        parameters: {
          mode: {
            type: 'string',
            required: true,
            description: 'always / ghost / hidden'
          }
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }]
        },
        execute(args) {
          const mode = ['always', 'ghost', 'hidden'].includes(args.mode) ? args.mode : 'always'
          const delivered = bridge.send({ type: 'pet-mode', mode })
          const label = { always: '常驻', ghost: '透明', hidden: '隐藏' }[mode]
          return delivered > 0
            ? `已把桌面上的あすみ切到${label}模式`
            : `桌面未连接，暂未切换桌宠模式（${mode}）`
        }
      })
    )
  )

  ctx.effect(() =>
    ctx.tools.register(
      defineTool({
        name: 'asumi_look',
        description:
          '看先輩的屏幕。截取当前桌面画面，并以图片的形式附在这次结果里，用于回答和屏幕有关的问题、读屏幕上的文字、或陪着先輩一起看。返回后直接根据看到的画面作答。',
        parameters: {
          question: { type: 'string', description: '想从屏幕上了解什么，例如「这段报错是什么」' }
        },
        output: {
          schema: { type: 'json' },
          render: (args, value) => [
            { type: 'image', attachment: value.attachment },
            {
              type: 'text',
              text: args.question
                ? `这是先輩现在的屏幕（${value.attachment.width}x${value.attachment.height}）。先輩想知道：${args.question}`
                : `这是先輩现在的屏幕（${value.attachment.width}x${value.attachment.height}）。`
            }
          ]
        },
        async execute(args) {
          const shot = await bridge.request({ type: 'capture-screen' })
          const [admitted] = await ctx.attachments.admitPromptContent([
            {
              type: 'image',
              mediaType: shot.mediaType || 'image/png',
              data: shot.data,
              name: 'asumi-screen.png'
            }
          ])
          return { attachment: admitted.attachment, question: args.question ?? '' }
        }
      })
    )
  )

  console.log('[asumi-desktop] mounted')
}
