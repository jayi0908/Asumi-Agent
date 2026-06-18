export interface ModelProvider {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  enabledModels: string[];
}

export interface AssistantConfig {
  id: string;
  name: string;
  description: string;
  providerId: string;
  modelId: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  contextLimit: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  providerId: string;
  modelId: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  contextLimit: number;
  workDirectory: string;
  permissions: string[];
  skills: string[];
}

export interface AppSettings {
  quickLaunchShortcut: string;
  quickLaunchAssistantId: string | null;
  quickLaunchEnabled: boolean;
  quickLaunchReadClipboard: boolean;
  providers: ModelProvider[];
  assistants: AssistantConfig[];
  agents: AgentConfig[];
}

const STORAGE_KEY = "asumi-settings";
const MIGRATED_KEY = "asumi-settings-migrated-v2";

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const defaults: AppSettings = {
  quickLaunchShortcut: "Command+Shift+Space",
  quickLaunchAssistantId: null,
  quickLaunchEnabled: true,
  quickLaunchReadClipboard: false,
  providers: [
    {
      id: "deepseek",
      name: "DeepSeek",
      apiKey: "",
      baseUrl: "https://api.deepseek.com",
      enabledModels: ["deepseek-chat", "deepseek-reasoner"],
    },
  ],
  assistants: [],
  agents: [],
};

function migrateFromV1(): AppSettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...defaults };

  try {
    const old = JSON.parse(raw);
    // If already v2 format (has providers array), return as-is
    if (Array.isArray(old.providers)) {
      return { ...defaults, ...old };
    }

    // Migrate v1 flat format → v2 structured
    const providerId = "deepseek";
    const settings: AppSettings = {
      quickLaunchShortcut: old.quickLaunchShortcut || defaults.quickLaunchShortcut,
      quickLaunchAssistantId: null,
      quickLaunchEnabled: true,
      quickLaunchReadClipboard: false,
      providers: [
        {
          id: providerId,
          name: "DeepSeek",
          apiKey: old.apiKey || "",
          baseUrl: old.baseUrl || defaults.providers[0].baseUrl,
          enabledModels: old.model ? [old.model] : defaults.providers[0].enabledModels,
        },
      ],
      assistants: [],
      agents: [],
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    localStorage.setItem(MIGRATED_KEY, "1");
    return settings;
  } catch {
    return { ...defaults };
  }
}

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Detect v1 flat format (has apiKey at top level but no providers array)
      if (!Array.isArray(parsed.providers)) {
        return migrateFromV1();
      }
      return { ...defaults, ...parsed };
    }
  } catch {}
  return { ...defaults };
}

export function saveSettings(settings: Partial<AppSettings>) {
  const current = getSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

// --- Provider CRUD ---

export function addProvider(
  provider: Omit<ModelProvider, "id" | "enabledModels">,
): ModelProvider {
  const newProvider: ModelProvider = { ...provider, id: genId(), enabledModels: [] };
  saveSettings({
    providers: [...getSettings().providers, newProvider],
  });
  return newProvider;
}

export function updateProvider(id: string, patch: Partial<ModelProvider>) {
  const settings = getSettings();
  saveSettings({
    providers: settings.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  });
}

export function removeProvider(id: string) {
  const settings = getSettings();
  saveSettings({
    providers: settings.providers.filter((p) => p.id !== id),
    // Also clean up assistants/agents referencing this provider
    assistants: settings.assistants.filter((a) => a.providerId !== id),
    agents: settings.agents.filter((a) => a.providerId !== id),
  });
}

// --- Assistant CRUD ---

export function addAssistant(
  assistant: Omit<AssistantConfig, "id">,
): AssistantConfig {
  const newAssistant: AssistantConfig = { ...assistant, id: genId() };
  saveSettings({
    assistants: [...getSettings().assistants, newAssistant],
  });
  return newAssistant;
}

export function updateAssistant(id: string, patch: Partial<AssistantConfig>) {
  const settings = getSettings();
  saveSettings({
    assistants: settings.assistants.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  });
}

export function removeAssistant(id: string) {
  const settings = getSettings();
  saveSettings({
    assistants: settings.assistants.filter((a) => a.id !== id),
    // Clear quickLaunchAssistantId if it pointed to this assistant
    quickLaunchAssistantId:
      settings.quickLaunchAssistantId === id ? null : settings.quickLaunchAssistantId,
  });
}

// --- Agent CRUD ---

export function addAgent(agent: Omit<AgentConfig, "id">): AgentConfig {
  const newAgent: AgentConfig = { ...agent, id: genId() };
  saveSettings({
    agents: [...getSettings().agents, newAgent],
  });
  return newAgent;
}

export function updateAgent(id: string, patch: Partial<AgentConfig>) {
  const settings = getSettings();
  saveSettings({
    agents: settings.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  });
}

export function removeAgent(id: string) {
  const settings = getSettings();
  saveSettings({
    agents: settings.agents.filter((a) => a.id !== id),
  });
}

// --- Resolution helpers ---

export function getProvider(id: string): ModelProvider | undefined {
  return getSettings().providers.find((p) => p.id === id);
}

export function getAssistant(id: string): AssistantConfig | undefined {
  return getSettings().assistants.find((a) => a.id === id);
}

export function getAgent(id: string): AgentConfig | undefined {
  return getSettings().agents.find((a) => a.id === id);
}

/** Resolve API credentials for a given assistant. Used by QuickLaunch. */
export function getAssistantApiConfig(assistantId: string): {
  apiKey: string;
  baseUrl: string;
  model: string;
} | null {
  const settings = getSettings();
  const assistant = settings.assistants.find((a) => a.id === assistantId);
  if (!assistant) return null;
  const provider = settings.providers.find((p) => p.id === assistant.providerId);
  if (!provider) return null;
  return {
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    model: assistant.modelId,
  };
}

/** Get all models across all providers that are enabled in the model library */
export function getModelLibrary(): { modelId: string; providerId: string; providerName: string }[] {
  const settings = getSettings();
  const result: { modelId: string; providerId: string; providerName: string }[] = [];
  for (const p of settings.providers) {
    for (const m of p.enabledModels) {
      result.push({ modelId: m, providerId: p.id, providerName: p.name });
    }
  }
  return result;
}

export function subscribeToSettings(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
