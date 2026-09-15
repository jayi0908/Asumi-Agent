import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { Service } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

const DEFAULT_PORT = 3099

function resolveDshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * Line-delimited JSON bridge to the Tauri shell.
 *
 * The agent side is the server: the Tauri shell connects once at startup to
 * receive desktop commands (speak, pet state, audio, notifications) and to
 * answer requests (screen capture). When nothing is connected the bridge stays
 * in detached mode so the agent never blocks on the desktop being absent.
 */
function createBridge() {
  const port = Number(process.env.ASUMI_DESKTOP_PORT || DEFAULT_PORT)
  const clients = new Set()
  let ready = false

  const server = createServer((socket) => {
    clients.add(socket)
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
      // Inbound frames (e.g. a screen-capture response) are handled by the
      // desktop client in Phase 3; ignore unknown lines for now.
      for (const line of String(chunk).split('\n')) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          console.log('[asumi-desktop] inbound', msg.type)
        } catch {
          /* ignore malformed frames */
        }
      }
    })
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

  function close() {
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

  return { send, close, port, isReady: () => ready, clientCount: () => clients.size }
}

export const name = 'asumi-desktop'

export const inject = ['tools']

export function apply(ctx) {
  const bridge = createBridge()
  ctx.effect(() => () => bridge.close())

  /** `ctx.asumiDesktop` — desktop capabilities for Asumi plugins and tools. */
  class AsumiDesktop extends Service {
    constructor(parent) {
      super(parent, 'asumiDesktop')
    }

    /** Ask the desktop to speak `text`, optionally with an emotion. */
    speak(text, options = {}) {
      return bridge.send({ type: 'speak', text, ...options })
    }

    /** Update the pet window's mood/expression. */
    setPetState(state) {
      return bridge.send({ type: 'pet-state', state })
    }

    /** Play a bundled audio asset by name. */
    playAudio(name) {
      return bridge.send({ type: 'audio', name })
    }

    /** Raise a desktop notification. */
    notify(title, body) {
      return bridge.send({ type: 'notify', title, body })
    }

    /** Request a screen frame; the shell answers asynchronously. */
    captureScreen(options = {}) {
      bridge.send({ type: 'capture-screen', ...options })
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
        name: 'asumi_speak',
        description:
          '让 Asumi 对先輩说一句话，并同步桌宠的表情。用于在完成任务、需要提醒或想和先輩互动时主动开口。',
        parameters: {
          text: { type: 'string', required: true, description: '要对先輩说的话' },
          emotion: {
            type: 'string',
            description: '情绪，取值：happy / neutral / shy / thinking / excited'
          }
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }]
        },
        execute(args) {
          const delivered = bridge.send({
            type: 'speak',
            text: args.text,
            emotion: args.emotion ?? 'neutral'
          })
          return delivered > 0
            ? `已通过桌宠说出：${args.text}`
            : `桌面未连接，暂存了这句话：${args.text}`
        }
      })
    )
  )

  console.log('[asumi-desktop] mounted')
}
