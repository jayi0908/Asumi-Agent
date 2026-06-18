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