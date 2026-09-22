import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { Service } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

const DEFAULT_PORT = 3099
const DEFAULT_TIMEOUT_MS = 20_000

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
          '对先輩说一句台词。日语 `ja` 会被她的声音朗读，中文 `zh` 是同一句的字幕，两者一起交给这次调用。需要出声时都用它 —— 只写中文不会发出声音。',
        parameters: {
          ja: {
            type: 'string',
            required: true,
            description: '要朗读的日语台词，纯日语，不要混中文'
          },
          zh: {
            type: 'string',
            required: true,
            description: '同一句话的中文翻译，作为字幕显示'
          },
          emotion: {
            type: 'string',
            description:
              '只影响桌宠的表情，不影响声音（模型只有一种音色），取值：happy / neutral / shy / thinking / excited'
          }
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }]
        },
        execute(args) {
          const delivered = bridge.send({
            type: 'say',
            ja: args.ja,
            zh: args.zh,
            emotion: args.emotion ?? 'neutral'
          })
          return delivered > 0
            ? `已对先輩说：${args.zh}`
            : `桌面未连接，暂存了这句：${args.zh}`
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
