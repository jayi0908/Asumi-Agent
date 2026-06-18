import { useState, useCallback, useMemo } from "react";
import {
  getSettings,
  addAgent,
  updateAgent,
  removeAgent,
  getModelLibrary,
} from "../../stores/settings";
import type { AgentConfig } from "../../stores/settings";
import CustomSelect from "./CustomSelect";

export default function AgentsSection() {
  const [settings, setSettings] = useState(() => getSettings());
  const refresh = useCallback(() => setSettings(getSettings()), []);
  const modelLibrary = useMemo(() => getModelLibrary(), [settings]);

  const [selectedId, setSelectedId] = useState<string | null>(
    settings.agents[0]?.id ?? null,
  );
  const [newPermission, setNewPermission] = useState("");
  const [newSkill, setNewSkill] = useState("");

  const selected = settings.agents.find((a) => a.id === selectedId);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleNew = useCallback(() => {
    const defaultModel = modelLibrary[0];
    const agent = addAgent({
      name: "New Agent",
      description: "",
      providerId: defaultModel?.providerId ?? settings.providers[0]?.id ?? "",
      modelId:
        defaultModel?.modelId ??
        (settings.providers[0]?.enabledModels[0] ?? ""),
      systemPrompt: "",
      temperature: 0.7,
      maxTokens: 4096,
      contextLimit: 8192,
      workDirectory: "",
      permissions: [],
      skills: [],
    });
    refresh();
    setSelectedId(agent.id);
  }, [modelLibrary, settings.providers, refresh]);

  const handleDelete = useCallback(
    (id: string) => {
      if (settings.agents.length <= 1) return;
      removeAgent(id);
      refresh();
      const remaining = getSettings().agents;
      setSelectedId(remaining[0]?.id ?? null);
    },
    [settings.agents.length, refresh],
  );

  const handleSave = useCallback(
    (patch: Partial<AgentConfig>) => {
      if (!selectedId) return;
      updateAgent(selectedId, patch);
      refresh();
    },
    [selectedId, refresh],
  );

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Left: Agent list */}
      <aside className="w-44 shrink-0 border-r border-gray-200 bg-white p-3 flex flex-col">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Agents
        </h3>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {settings.agents.map((a) => (
            <div key={a.id} className="group relative">
              <button
                onClick={() => handleSelect(a.id)}
                className={`w-full text-left px-3 py-2 text-xs rounded-md transition-colors ${
                  selectedId === a.id
                    ? "bg-indigo-50 text-indigo-600 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span className="truncate block">{a.name}</span>
                <span className="text-[10px] text-gray-400 mt-0.5 block truncate">
                  {a.modelId || "No model"}
                </span>
              </button>
              <button
                onClick={() => handleDelete(a.id)}
                className="absolute top-1 right-1 hidden group-hover:block text-gray-300 hover:text-red-400 transition-colors"
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={handleNew}
          className="mt-2 w-full text-left px-3 py-1.5 text-xs text-indigo-500 hover:bg-indigo-50 rounded-md transition-colors"
        >
          + Add Agent
        </button>
      </aside>

      {/* Right: Detail */}
      <div className="flex-1 p-4 overflow-y-auto">
        {!selectedId ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">
            {settings.agents.length === 0
              ? "No agents yet — add one to get started"
              : "Select an agent to configure"}
          </div>
        ) : (
          <div className="max-w-lg space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">
              Agent Settings
            </h3>

            {/* Name */}
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Name</p>
                <input
                  type="text"
                  defaultValue={selected?.name}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val && val !== selected?.name) handleSave({ name: val });
                  }}
                  className="w-44 text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-colors"
                />
              </div>
            </div>

            {/* Description */}
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Description</p>
                <input
                  type="text"
                  defaultValue={selected?.description}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val !== selected?.description) handleSave({ description: val });
                  }}
                  placeholder="Brief description"
                  className="w-44 text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-colors"
                />
              </div>
            </div>

            {/* Model */}
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Model</p>
                <CustomSelect
                  value={selected?.modelId ?? ""}
                  options={modelLibrary.map((m) => ({
                    value: m.modelId,
                    label: `${m.modelId} (${m.providerName})`,
                  }))}
                  onChange={(modelId) => {
                    const entry = modelLibrary.find((m) => m.modelId === modelId);
                    if (entry) {
                      handleSave({ modelId, providerId: entry.providerId });
                    }
                  }}
                  placeholder="No models available"
                  className="w-44"
                />
              </div>
            </div>

            {/* System Prompt */}
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-sm font-medium text-gray-700 mb-2">
                System Prompt
              </p>
              <textarea
                defaultValue={selected?.systemPrompt}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== selected?.systemPrompt) handleSave({ systemPrompt: val });
                }}
                placeholder="Optional system prompt"
                rows={3}
                className="w-full text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-colors resize-none"
              />
            </div>

            {/* Temperature */}
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Temperature</p>
                <span className="text-xs font-mono text-gray-500">
                  {selected?.temperature.toFixed(1) ?? "0.7"}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                defaultValue={selected?.temperature ?? 0.7}
                onChange={(e) => handleSave({ temperature: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>0</span>
                <span>1</span>
                <span>2</span>
              </div>
            </div>

            {/* Max Tokens & Context Limit */}
            <div className="flex gap-3">
              <div className="flex-1 bg-white rounded-lg border border-gray-200 px-4 py-3">
                <p className="text-sm font-medium text-gray-700 mb-1">Max Tokens</p>
                <input
                  type="number"
                  min={1}
                  defaultValue={selected?.maxTokens ?? 4096}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0) handleSave({ maxTokens: val });
                  }}
                  className="w-full text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-colors"
                />
              </div>
              <div className="flex-1 bg-white rounded-lg border border-gray-200 px-4 py-3">
                <p className="text-sm font-medium text-gray-700 mb-1">Context Limit</p>
                <input
                  type="number"
                  min={1}
                  defaultValue={selected?.contextLimit ?? 8192}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0) handleSave({ contextLimit: val });
                  }}
                  className="w-full text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-colors"
                />
              </div>
            </div>

            {/* Work Directory */}
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Work Directory</p>
                <input
                  type="text"
                  defaultValue={selected?.workDirectory}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val !== selected?.workDirectory) handleSave({ workDirectory: val });
                  }}
                  placeholder="e.g. /home/user/projects"
                  className="w-44 text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-colors"
                />
              </div>
            </div>

            {/* Permissions */}
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Permissions</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(selected?.permissions ?? []).map((perm, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono bg-gray-100 text-gray-600 rounded-full"
                  >
                    {perm}
                    <button
                      onClick={() => {
                        const perms = (selected?.permissions ?? []).filter((_, j) => j !== i);
                        handleSave({ permissions: perms });
                      }}
                      className="text-gray-400 hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newPermission.trim()) return;
                  handleSave({
                    permissions: [...(selected?.permissions ?? []), newPermission.trim()],
                  });
                  setNewPermission("");
                }}
                className="flex gap-1"
              >
                <input
                  type="text"
                  value={newPermission}
                  onChange={(e) => setNewPermission(e.target.value)}
                  placeholder="e.g. read, write, execute"
                  className="flex-1 text-[10px] font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-colors"
                />
                <button
                  type="submit"
                  className="px-2 py-1 text-[10px] font-medium text-white bg-indigo-400 rounded-md hover:bg-indigo-500 transition-colors"
                >
                  Add
                </button>
              </form>
            </div>

            {/* Skills */}
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Skills</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(selected?.skills ?? []).map((skill, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono bg-indigo-50 text-indigo-600 rounded-full"
                  >
                    {skill}
                    <button
                      onClick={() => {
                        const skills = (selected?.skills ?? []).filter((_, j) => j !== i);
                        handleSave({ skills });
                      }}
                      className="text-indigo-300 hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newSkill.trim()) return;
                  handleSave({
                    skills: [...(selected?.skills ?? []), newSkill.trim()],
                  });
                  setNewSkill("");
                }}
                className="flex gap-1"
              >
                <input
                  type="text"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder="e.g. web-search, code-review"
                  className="flex-1 text-[10px] font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-colors"
                />
                <button
                  type="submit"
                  className="px-2 py-1 text-[10px] font-medium text-white bg-indigo-400 rounded-md hover:bg-indigo-500 transition-colors"
                >
                  Add
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
