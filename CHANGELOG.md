# Changelog

## v0.1.0 (Pre-alpha) 

### 2026.6.18

#### Models & Providers
- Add/configure/delete AI providers with custom API base URL and API key
- Fetch available models from provider's `/v1/models` endpoint
- Enable/disable models in per-provider model library
- Provider → Model Library → Assistant/Agent architecture

#### Assistants
- Create/edit/delete assistants with name, description, model, system prompt, temperature, max tokens, context limit
- System prompt sent as `system` role message to LLM API

#### Agents
- Create/edit/delete agents with all assistant fields plus work directory, permissions, skills

#### Quick Launch
- Global shortcut toggles overlay window at cursor position
- Customizable shortcut via keyboard recording
- Enable/disable toggle and assistant selector in settings
- Read clipboard on launch option
- Real-time API call with loading and error states

#### Backend
- OpenAI-compatible `/v1/chat/completions` and `/v1/models` API support via reqwest
- macOS cursor positioning for Quick Launch window placement
- Clipboard read support
- System-wide global shortcut registration
- Tray icon with menu
- Settings migration from v1 flat format to v2 structured format

### 2026.6.21

#### Asumi Skill
- Character response styling via single merged streaming API call — style guide injected into system prompt, no separate formatter step
- Character config JSON file at `public/character-configs/default.json` — user-editable persona, voice, language, style guide, and formatting rules
- Enable/disable toggle and character config selector in settings
- Code blocks and math formulas preserved untouched when styling is active

#### Streaming
- All LLM calls now use SSE streaming (`stream: true`) for incremental token output
- Tauri `Channel`-based token delivery from Rust backend to React frontend
- Both normal and skill-styled responses stream in real-time

#### Backend
- `stream_submit_message` Tauri command with optional character config merging
- `build_style_guide()` — dynamically builds a style guide prompt from character config JSON
- `stream` feature enabled on reqwest; `futures-util` added for async stream iteration