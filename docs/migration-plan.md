# Cherry Studio → Asumi Agent Migration Plan

> **Branch**: `migration-plan`  
> **Status**: Planning — do not execute  
> **License**: AGPL-3.0 (compatible with cherry-studio upstream)

## 1. Objective

Rebuild cherry-studio's architectural design and core features on Asumi Agent's tech stack (**Tauri 2 + React 19 + TypeScript + TailwindCSS 4 + Rust**), preserving cherry-studio's UI/UX design language while dropping features irrelevant to the Asumi Agent desktop companion concept.

### Why This Approach

- cherry-studio is an Electron app with Node.js backend; Asumi Agent is Tauri 2 with Rust backend. The **main process logic must be rewritten in Rust**.
- The renderer (React frontend) can be **structurally ported** but needs to drop Ant Design + styled-components in favor of TailwindCSS.
- The IPC layer changes from Electron `ipcMain`/`ipcRenderer` to Tauri `invoke()`/`commands`.

---

## 2. Architecture Comparison

| Layer | cherry-studio (Electron) | → | Asumi Agent (Tauri 2) |
|---|---|---|---|
| **Desktop shell** | Electron 41 | | Tauri 2 |
| **Backend language** | TypeScript (Node.js) | | Rust |
| **Frontend** | React 19 + Ant Design 5 + styled-components + TailwindCSS 4 | | React 19 + TailwindCSS 4 |
| **Routing** | TanStack Router v1 | | react-router-dom v7 |
| **State (legacy)** | Redux Toolkit | | localStorage + React context |
| **State (modern)** | TanStack React Query | | TanStack React Query |
| **Database** | libSQL (SQLite, main process) + Dexie.js (IndexedDB, renderer) | | SQLite via Rust (tauri-plugin-sql or rusqlite) |
| **IPC** | Electron ipcMain/ipcRenderer | | Tauri invoke() + Channel |
| **Windows** | BrowserWindow (multi-window) | | WebviewWindow (multi-webview) |
| **Streaming AI** | IPC stream bridge + Vercel AI SDK | | Tauri Channel + fetch in Rust (already done) |
| **Build** | electron-vite (rolldown-vite) | | Vite (rolldown-vite compatible) |
| **Package manager** | pnpm workspace (monorepo) | | pnpm (single package) |

---

## 3. Scope: What to Port, What to Skip

### 3.1 ✅ Port (Core Features)

| Feature | Priority | Rationale |
|---|---|---|
| **Multi-window architecture** | P0 | Main window + Settings window + Quick Launch (already exists) |
| **Chat system** | P0 | The core feature — streaming AI conversation with multi-model support |
| **Provider/Model management** | P0 | Already partially built; needs cherry-studio's richer provider registry concept |
| **Assistant configuration** | P0 | Already partially built; needs system prompt templates, parameter presets |
| **Agent configuration** | P0 | Already partially built; needs integrate with backend |
| **Settings system** | P0 | Structured sections with persistence (already exists, needs expansion) |
| **Tray/Menu bar** | P0 | Already implemented |
| **Quick Launch/Assistant** | P0 | Already implemented; needs UI polish per cherry-studio design |
| **Theme system** | P1 | Light/dark mode + transparent window |
| **i18n** | P1 | Chinese/English/Japanese (cherry-studio has 12 locales; start with 3) |
| **Markdown rendering** | P1 | Chat message rendering with code highlighting |
| **Data persistence** | P1 | Migrate from localStorage to SQLite in Rust backend |
| **Shortcut management** | P1 | Already partially done; needs full shortcut config UI |

### 3.2 ❌ Skip (Not Relevant to Asumi Agent)

- Knowledge base management
- Notes/Memos
- Code CLI
- Mini-apps
- Image generation (Paintings)
- File management
- MCP (Model Context Protocol)
- Web search
- Channels (WeChat, etc.)
- Translation
- History browser
- Selection toolbar
- Enterprise features
- OpenClaw (browser automation)
- Copilot integration
- OCR
- TTS (will be implemented later as a native Asumi feature, not ported)

---

## 4. New Project Structure (Target)

```
Asumi-Agent/
├── src/                              # React frontend
│   ├── main.tsx                      # Entry point
│   ├── App.tsx                       # Root component
│   ├── App.css                       # Global styles
│   ├── vite-env.d.ts
│   ├── components/
│   │   ├── ui/                       # Reusable UI primitives (TailwindCSS-based)
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Toggle.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Dropdown.tsx
│   │   │   ├── Tabs.tsx
│   │   │   ├── Tooltip.tsx
│   │   │   ├── Slider.tsx
│   │   │   ├── Tag.tsx
│   │   │   └── index.ts
│   │   ├── layout/
│   │   │   ├── AppShell.tsx          # Main app shell (sidebar + content)
│   │   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   │   ├── Titlebar.tsx          # Custom titlebar (for transparent window)
│   │   │   └── TopView.tsx           # Modal/overlay container
│   │   ├── chat/
│   │   │   ├── ChatView.tsx          # Main chat view
│   │   │   ├── ChatInput.tsx         # Message input with attachments
│   │   │   ├── MessageList.tsx       # Virtualized message list
│   │   │   ├── MessageBubble.tsx     # Individual message bubble
│   │   │   ├── StreamingText.tsx     # Live streaming text display
│   │   │   └── ModelSelector.tsx     # Model dropdown in chat
│   │   ├── markdown/
│   │   │   ├── MarkdownRenderer.tsx  # Markdown → React rendering
│   │   │   ├── CodeBlock.tsx         # Syntax-highlighted code blocks
│   │   │   └── MermaidDiagram.tsx    # Mermaid chart rendering
│   │   ├── settings/
│   │   │   ├── SettingsLayout.tsx    # Two-column settings layout
│   │   │   ├── GeneralSettings.tsx   # General preferences
│   │   │   ├── ProviderSettings.tsx  # Provider CRUD + model library
│   │   │   ├── ModelSettings.tsx     # Model configuration
│   │   │   ├── AssistantSettings.tsx # Assistant CRUD
│   │   │   ├── AgentSettings.tsx     # Agent CRUD
│   │   │   ├── AsumiSkillSettings.tsx# Character style settings
│   │   │   ├── ShortcutSettings.tsx  # Keyboard shortcuts
│   │   │   ├── AboutSettings.tsx     # About page
│   │   │   └── ThemeSettings.tsx     # Theme selection
│   │   ├── quick-launch/
│   │   │   └── QuickLaunch.tsx       # Quick launch overlay (already exists)
│   │   ├── home/
│   │   │   └── HomePage.tsx          # Welcome/landing page
│   │   └── provider/
│   │       └── ProviderIcon.tsx      # Provider logo icons
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Chat.tsx
│   │   ├── Assistants.tsx
│   │   ├── Agents.tsx
│   │   └── Settings.tsx
│   ├── hooks/
│   │   ├── useSettings.ts            # Settings CRUD (replaces store)
│   │   ├── useProviders.ts           # Provider data hook
│   │   ├── useAssistants.ts          # Assistant data hook
│   │   ├── useAgents.ts              # Agent data hook
│   │   ├── useChat.ts                # Chat state management
│   │   ├── useStreamingChat.ts       # Streaming chat via Tauri Channel
│   │   ├── useTheme.ts               # Theme hook
│   │   ├── useShortcut.ts            # Shortcut registration
│   │   └── useI18n.ts                # Internationalization
│   ├── services/
│   │   ├── api.ts                    # Tauri invoke wrappers (typed)
│   │   ├── llm.ts                    # LLM API calls (via Rust backend)
│   │   └── storage.ts               # Persistent storage abstraction
│   ├── i18n/
│   │   ├── index.ts                  # i18n setup
│   │   ├── zh-CN.json
│   │   ├── en-US.json
│   │   └── ja-JP.json
│   ├── contexts/
│   │   ├── ThemeContext.tsx
│   │   └── SettingsContext.tsx
│   ├── types/
│   │   ├── provider.ts
│   │   ├── assistant.ts
│   │   ├── agent.ts
│   │   ├── chat.ts
│   │   └── settings.ts
│   └── utils/
│       ├── cn.ts                     # Tailwind class merge utility
│       └── format.ts                 # Date/number formatting
├── src-tauri/                        # Rust backend
│   ├── src/
│   │   ├── main.rs                   # Binary entry
│   │   ├── lib.rs                    # Command registration, setup
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── chat.rs               # Chat/streaming commands
│   │   │   ├── provider.rs           # Provider CRUD commands
│   │   │   ├── assistant.rs          # Assistant CRUD commands
│   │   │   ├── agent.rs              # Agent CRUD commands
│   │   │   ├── settings.rs           # Settings read/write commands
│   │   │   ├── clipboard.rs          # Clipboard commands
│   │   │   └── window.rs             # Window management commands
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── connection.rs         # SQLite connection management
│   │   │   ├── migrations.rs         # Schema migrations
│   │   │   └── models.rs             # Data models
│   │   ├── llm/
│   │   │   ├── mod.rs
│   │   │   ├── client.rs             # HTTP client for OpenAI-compatible API
│   │   │   ├── streaming.rs          # SSE stream parser
│   │   │   └── provider.rs           # Provider abstraction
│   │   ├── state.rs                  # App state management
│   │   ├── tray.rs                   # System tray
│   │   └── window.rs                 # Window creation/management
│   ├── Cargo.toml
│   └── tauri.conf.json
├── public/
│   ├── character-configs/            # Asumi character profiles
│   └── icons/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.ts
```

---

## 5. Phase Plan

### Phase 1: Foundation (Week 1-2)

**Goal**: Establish the Tauri 2 + React + TailwindCSS architecture matching cherry-studio's design patterns.

#### 1.1 Rust Backend Foundation

- [ ] Set up modular Rust project structure (`commands/`, `db/`, `llm/`, `state.rs`)
- [ ] Implement SQLite persistence with `rusqlite`:
  - Tables: `providers`, `models`, `assistants`, `agents`, `settings`, `chat_history`, `messages`
  - Schema migrations system
- [ ] Port core IPC commands from current `lib.rs` into modular command files
- [ ] Implement typed command request/response structures with `serde`
- [ ] State management: `AppState` struct with `Mutex`-protected fields

#### 1.2 Frontend Foundation

- [ ] Set up project directory structure per Section 4
- [ ] Build **UI primitives** (`components/ui/`) — pure TailwindCSS replacements for Ant Design components used in cherry-studio:
  - Button, Input, Select, Toggle, Modal, Dropdown, Tabs, Tooltip, Slider, Tag
  - Each component: composable, accessible (WAI-ARIA), dark-mode aware
  - Use `clsx` + `tailwind-merge` for className composition
- [ ] Implement **theme system**: light/dark mode via Tailwind `dark:` variants + CSS custom properties
- [ ] Set up i18n with `i18next` + `react-i18next` (3 languages: zh-CN, en-US, ja-JP)
- [ ] Create `AppShell` layout component with collapsible sidebar navigation

#### 1.3 Window Architecture

- [ ] Main window: AppShell with sidebar routing
- [ ] Settings window: Separate window (or in-app route — Tauri allows both)
- [ ] Quick Launch window: Already implemented; polish UI
- [ ] Window management: Rust commands for creating/showing/hiding windows

---

### Phase 2: Provider & Model System (Week 3-4)

**Goal**: Complete provider/model management matching cherry-studio's provider registry concept.

#### 2.1 Backend

- [ ] Provider CRUD commands: `create_provider`, `update_provider`, `delete_provider`, `list_providers`
- [ ] Model library: `add_model`, `remove_model`, `fetch_models` (from API), `list_models`
- [ ] Provider testing: `test_connection` command
- [ ] Model capabilities metadata (context window, pricing, features) — static registry
- [ ] API key encryption at rest

#### 2.2 Frontend

- [ ] `ProviderSettings` page: two-panel layout (list + detail)
- [ ] Provider form: name, API base URL, API key (with show/hide), model fetch button
- [ ] Model library view: grid/list of models with enable/disable toggle
- [ ] Provider icon system: SVG icons for major providers (OpenAI, Anthropic, Google, DeepSeek, etc.)
- [ ] Connection test with status indicator

---

### Phase 3: Chat System (Week 5-7)

**Goal**: The core AI conversation experience, matching cherry-studio's chat UI.

#### 3.1 Backend

- [ ] Streaming chat command: `stream_chat` via Tauri Channel (already partially done)
- [ ] Chat history persistence: save/load conversations
- [ ] Multi-turn conversation: system prompt + history + current message
- [ ] Abort/cancel streaming
- [ ] Token counting & usage tracking

#### 3.2 Frontend

- [ ] `ChatView`: main chat interface
  - Message list with auto-scroll
  - Virtual scrolling for large histories (use `@tanstack/react-virtual`)
- [ ] `ChatInput`: message composer
  - Text input with auto-resize
  - Model selector dropdown
  - Send button with loading state
  - Enter to send, Shift+Enter for newline
- [ ] `MessageBubble`: individual message
  - User messages: right-aligned, accent color
  - Assistant messages: left-aligned, with avatar
  - Streaming text animation (character-by-character)
  - Copy, retry, delete actions on hover
- [ ] `MarkdownRenderer`: full markdown support
  - Code blocks with syntax highlighting (Shiki via Rust backend)
  - Inline code, bold, italic, links
  - Tables, lists, blockquotes
  - Mermaid diagrams
  - Math formulas (KaTeX)
- [ ] `ModelSelector`: dropdown with provider grouping, model search

---

### Phase 4: Assistant & Agent System (Week 8-9)

**Goal**: Complete assistant/agent management, building on existing implementation.

#### 4.1 Backend

- [ ] Assistant CRUD commands (migrate from current flat storage to SQLite)
- [ ] Agent CRUD commands with work directory, permissions, skills
- [ ] Assistant/Agent import/export (JSON)
- [ ] System prompt templates

#### 4.2 Frontend

- [ ] `AssistantSettings`: enhanced two-panel settings
  - System prompt editor with token counter
  - Parameter presets (temperature, max_tokens, top_p)
  - Model assignment
  - Preview/test panel
- [ ] `AgentSettings`: agent-specific fields
  - Work directory picker
  - Permission tags
  - Skill tags
- [ ] Assistant selector in chat: quick switch between assistants

---

### Phase 5: Polish & Settings (Week 10-11)

**Goal**: Complete settings, i18n, shortcuts, and UI polish.

#### 5.1 Settings

- [ ] General: language, startup behavior, tray behavior
- [ ] Theme: light/dark/system, accent color, transparent window
- [ ] Shortcuts: global hotkey configuration (already partially done)
- [ ] About: version, licenses, acknowledgments
- [ ] Data: export/import settings, clear history

#### 5.2 i18n

- [ ] Complete Chinese (zh-CN) translations
- [ ] English (en-US) translations
- [ ] Japanese (ja-JP) translations
- [ ] Language switcher in settings

#### 5.3 UI Polish

- [ ] Smooth transitions/animations (framer-motion)
- [ ] Loading states & skeletons
- [ ] Error states & toasts
- [ ] Empty states with helpful text
- [ ] Responsive sidebar (collapsible)
- [ ] Drag-and-drop for reordering (assistants, agents)

---

## 6. Design Migration: Ant Design → TailwindCSS

cherry-studio uses Ant Design 5 extensively. The migration strategy:

### 6.1 Component Mapping

| Ant Design | → | TailwindCSS Custom |
|---|---|---|
| `Button` | | `ui/Button.tsx` with variants (primary, secondary, ghost, danger) |
| `Input` / `Input.Password` | | `ui/Input.tsx` with type variants |
| `Select` | | `ui/Select.tsx` with search, multi-select |
| `Switch` | | `ui/Toggle.tsx` |
| `Modal` | | `ui/Modal.tsx` with overlay + transition |
| `Dropdown` | | `ui/Dropdown.tsx` with menu items |
| `Tabs` | | `ui/Tabs.tsx` with underline animation |
| `Tooltip` | | `ui/Tooltip.tsx` with positioning |
| `Slider` | | `ui/Slider.tsx` |
| `Tag` | | `ui/Tag.tsx` with color variants |
| `Avatar` | | Simple div with initials/image |
| `Spin` | | CSS spinner animation |
| `message` / `notification` | | Toast system via context |

### 6.2 Design Tokens

Convert Ant Design's token system to Tailwind CSS custom properties:

```css
:root {
  --color-primary: #6366f1;       /* Indigo-500 */
  --color-primary-hover: #4f46e5; /* Indigo-600 */
  --color-bg-base: #ffffff;
  --color-bg-elevated: #fafafa;
  --color-text: #1e293b;
  --color-text-secondary: #64748b;
  --color-border: #e2e8f0;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

.dark {
  --color-primary: #818cf8;       /* Indigo-400 */
  --color-bg-base: #0f172a;
  --color-bg-elevated: #1e293b;
  --color-text: #e2e8f0;
  --color-text-secondary: #94a3b8;
  --color-border: #334155;
}
```

### 6.3 Layout Pattern

cherry-studio's AppShell layout → React + TailwindCSS:

```
┌──────────┬────────────────────────────────┐
│ Sidebar  │ Content Area                   │
│          │                                │
│ ─ Home   │  Header (with title + actions) │
│ ─ Chat   │  ───────────────────────────── │
│ ─ Agents │                                │
│          │  Main Content                  │
│ ──────── │  (chat / settings / etc.)      │
│ Settings │                                │
│          │                                │
└──────────┴────────────────────────────────┘
```

---

## 7. Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  React Frontend                                                 │
│                                                                 │
│  Components ← hooks (useChat, useProviders) ← services (api.ts) │
│       ↓                                                         │
│  invoke("command", { params })  /  Channel<string> (streaming)  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Tauri IPC
┌───────────────────────────┴─────────────────────────────────────┐
│  Rust Backend                                                   │
│                                                                 │
│  commands/  ← Tauri command handlers                            │
│       ↓                                                         │
│  llm/  ← HTTP client to OpenAI-compatible API                   │
│       ↓                                                         │
│  db/  ← SQLite via rusqlite (persistence)                       │
│                                                                 │
│  state.rs  ← AppState (Mutex<State>) manages runtime state      │
│  window.rs ← Window creation, positioning, visibility           │
│  tray.rs   ← System tray icon + menu                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Key Dependencies (Target)

### Frontend (package.json)

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-global-shortcut": "^2",
    "@tauri-apps/plugin-opener": "^2",
    "@tauri-apps/plugin-clipboard-manager": "^2",
    "react": "^19.1",
    "react-dom": "^19.1",
    "react-router-dom": "^7",
    "react-markdown": "^10",
    "react-i18next": "^14",
    "i18next": "^23",
    "remark-gfm": "^4",
    "remark-math": "^6",
    "rehype-katex": "^7",
    "katex": "^0.16",
    "mermaid": "^11",
    "react-syntax-highlighter": "^15",
    "clsx": "^2",
    "tailwind-merge": "^3",
    "framer-motion": "^12",
    "@tanstack/react-virtual": "^3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4",
    "tailwindcss": "^4",
    "@vitejs/plugin-react": "^4",
    "typescript": "~5.8",
    "vite": "^7"
  }
}
```

### Backend (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = ["macos-private-api", "tray-icon"] }
tauri-plugin-opener = "2"
tauri-plugin-global-shortcut = "2"
tauri-plugin-clipboard-manager = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
reqwest = { version = "0.12", features = ["json", "rustls-tls", "stream"] }
futures-util = "0.3"
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4"] }
arboard = "3"
image = { version = "0.25", features = ["png"] }

[target.'cfg(target_os = "macos")'.dependencies]
core-graphics = "0.24"
```

---

## 9. Risk & Considerations

### 9.1 Scope Risk

cherry-studio is ~55万行 of code. This migration ports the **architecture and core design**, not every feature. Expected final size: **~2-3万行** (Rust + TypeScript combined).

### 9.2 Compatibility

- **Vercel AI SDK** (used by cherry-studio) is Node.js-only. The Rust backend handles LLM calls directly via `reqwest` (already working in current Asumi Agent).
- **Shiki** (code highlighting) is Node.js-based. Use `syntect` (Rust) on the backend or `react-syntax-highlighter` on frontend.
- **Mermaid** and **KaTeX** can render client-side in React.

### 9.3 License

Both projects are now AGPL-3.0. The migration is a derivative work and must:
- Keep AGPL-3.0 license
- Preserve copyright notices
- State modifications prominently
- Make source code available

---

## 10. Execute Order Summary

| Phase | Duration | Key Deliverable |
|---|---|---|
| 1. Foundation | Weeks 1-2 | Rust module structure, UI primitives, theme, i18n, AppShell layout |
| 2. Provider/Model | Weeks 3-4 | Provider CRUD, model library, provider icons, connection testing |
| 3. Chat System | Weeks 5-7 | Streaming chat, markdown rendering, virtual scrolling, history |
| 4. Assistant/Agent | Weeks 8-9 | CRUD, system prompts, parameter presets, import/export |
| 5. Polish | Weeks 10-11 | Settings completion, shortcuts, data export, UI polish |

### Ready to Execute sign-off checklist

- [ ] Review and approve architecture decisions
- [ ] Confirm TailwindCSS-only approach (no Ant Design)
- [ ] Confirm SQLite persistence via Rust backend
- [ ] Confirm which cherry-studio features to port/skip
- [ ] Set up development environment
- [ ] Begin Phase 1 implementation
