import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  getSettings,
  updateProvider,
  removeProvider,
  addProvider,
} from "../../stores/settings";

interface FetchedModel {
  id: string;
  owned_by: string;
}

export default function ModelsSection() {
  const [settings, setSettings] = useState(() => getSettings());
  const [selectedId, setSelectedId] = useState<string | null>(
    settings.providers[0]?.id ?? null,
  );
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  const refresh = useCallback(() => setSettings(getSettings()), []);

  const selected = settings.providers.find((p) => p.id === selectedId);

  // Close popup on Escape
  useEffect(() => {
    if (!showPopup) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPopup(false);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [showPopup]);

  // Close popup when switching providers
  useEffect(() => {
    setShowPopup(false);
  }, [selectedId]);

  const handleFetchModels = useCallback(async () => {
    if (!selected) return;
    setFetchLoading(true);
    setFetchError(null);
    try {
      const fetched = await invoke<FetchedModel[]>("fetch_models", {
        apiKey: selected.apiKey,
        baseUrl: selected.baseUrl,
      });
      setFetchedModels(fetched);
      setShowPopup(true);
    } catch (err) {
      setFetchError(String(err));
    } finally {
      setFetchLoading(false);
    }
  }, [selected]);

  const toggleModel = useCallback(
    (modelId: string, enable: boolean) => {
      if (!selected) return;
      const enabled = enable
        ? [...selected.enabledModels, modelId]
        : selected.enabledModels.filter((m) => m !== modelId);
      updateProvider(selected.id, { enabledModels: enabled });
      refresh();
    },
    [selected, refresh],
  );

  const isInLibrary = useCallback(
    (modelId: string) => selected?.enabledModels.includes(modelId) ?? false,
    [selected],
  );

  const libraryModels = selected?.enabledModels ?? [];

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Left: Provider list */}
      <aside className="w-44 shrink-0 border-r border-gray-200 bg-white p-3 flex flex-col">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Providers
        </h3>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {settings.providers.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelectedId(p.id);
                setFetchedModels([]);
                setFetchError(null);
              }}
              className={`w-full text-left px-3 py-2 text-xs rounded-md transition-colors ${
                selectedId === p.id
                  ? "bg-indigo-50 text-indigo-600 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span className="truncate block">{p.name}</span>
              <span className="text-[10px] text-gray-400 mt-0.5 block truncate">
                {p.enabledModels.length} models
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            const provider = addProvider({
              name: "New Provider",
              apiKey: "",
              baseUrl: "https://api.openai.com",
            });
            refresh();
            setSelectedId(provider.id);
          }}
          className="mt-2 w-full text-left px-3 py-1.5 text-xs text-indigo-500 hover:bg-indigo-50 rounded-md transition-colors"
        >
          + Add Provider
        </button>
      </aside>

      {/* Right: Provider Detail */}
      <div className="flex-1 p-4 overflow-y-auto">
        {!selectedId || !selected ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">
            {settings.providers.length > 0
              ? "Select a provider to configure"
              : "Add a provider to get started"}
          </div>
        ) : (
          <div className="max-w-lg space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">
              Provider Settings
            </h3>

            {/* Name */}
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Name</p>
                <input
                  type="text"
                  defaultValue={selected.name}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val && val !== selected.name) {
                      updateProvider(selected.id, { name: val });
                      refresh();
                    }
                  }}
                  className="w-44 text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-colors"
                />
              </div>
            </div>

            {/* API Base URL */}
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">API Base URL</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    e.g. https://api.deepseek.com
                  </p>
                </div>
                <input
                  type="text"
                  defaultValue={selected.baseUrl}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val && val !== selected.baseUrl) {
                      updateProvider(selected.id, { baseUrl: val });
                      refresh();
                    }
                  }}
                  placeholder="https://api.deepseek.com"
                  className="w-44 text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-colors"
                />
              </div>
            </div>

            {/* API Key */}
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">API Key</p>
                  <p className="text-xs text-gray-400 mt-0.5">API authentication key</p>
                </div>
                <div className="relative w-44">
                  <input
                    type={showKey ? "text" : "password"}
                    defaultValue={selected.apiKey}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val !== selected.apiKey) {
                        updateProvider(selected.id, { apiKey: val });
                        refresh();
                      }
                    }}
                    placeholder="sk-..."
                    className="w-full text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md pl-2.5 pr-8 py-1.5 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showKey ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Fetch Models */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleFetchModels}
                disabled={fetchLoading || !selected.apiKey}
                className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-500 rounded-md hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {fetchLoading ? "Fetching..." : "Fetch Models"}
              </button>
              {fetchError && (
                <span className="text-xs text-red-500">{fetchError}</span>
              )}
            </div>

            {/* Model Library */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Model Library
                </h4>
                <span className="text-[10px] text-gray-400">
                  {libraryModels.length} model{libraryModels.length !== 1 ? "s" : ""}
                </span>
              </div>

              {libraryModels.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 px-4 py-6 text-center">
                  <p className="text-xs text-gray-400">
                    No models in library — fetch and add models above
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {libraryModels.map((modelId) => (
                    <div
                      key={modelId}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono text-gray-700 truncate">{modelId}</p>
                      </div>
                      <button
                        onClick={() => toggleModel(modelId, false)}
                        className="ml-2 shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                        title="Remove from library"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" d="M5 12h14" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="pt-4 border-t border-gray-100">
              <button
                onClick={() => {
                  if (settings.providers.length <= 1) return;
                  removeProvider(selected.id);
                  refresh();
                  const remaining = getSettings().providers;
                  setSelectedId(remaining[0]?.id ?? null);
                  setFetchedModels([]);
                }}
                disabled={settings.providers.length <= 1}
                className="text-xs text-red-400 hover:text-red-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Delete Provider
              </button>
            </div>
          </div>
        )}

        {/* Popup overlay */}
        {showPopup && fetchedModels.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[420px] max-h-[480px] flex flex-col overflow-hidden">
              {/* Popup header */}
              <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">
                    Available Models
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {fetchedModels.length} model{fetchedModels.length !== 1 ? "s" : ""} from {selected?.baseUrl ?? "API"}
                  </p>
                </div>
                <button
                  onClick={() => setShowPopup(false)}
                  className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Popup body */}
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {fetchedModels.map((m) => {
                  const inLib = isInLibrary(m.id);
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono text-gray-700 truncate">{m.id}</p>
                        {m.owned_by && (
                          <p className="text-[10px] text-gray-400 truncate">{m.owned_by}</p>
                        )}
                      </div>
                      <button
                        onClick={() => toggleModel(m.id, !inLib)}
                        className={`shrink-0 w-5 h-5 flex items-center justify-center rounded-full transition-colors ${
                          inLib
                            ? "text-gray-300 hover:text-red-400 hover:bg-red-50"
                            : "text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50"
                        }`}
                        title={inLib ? "Remove from library" : "Add to library"}
                      >
                        {inLib ? (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" d="M5 12h14" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Popup footer */}
              <div className="shrink-0 px-5 py-3 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => setShowPopup(false)}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-500 rounded-md hover:bg-indigo-600 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
