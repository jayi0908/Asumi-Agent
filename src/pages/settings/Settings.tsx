import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { getSettings, saveSettings } from "../../stores/settings";
import SnowflakeIcon from "../../components/SnowflakeIcon";
import ModelsSection from "../../components/settings/ModelsSection";
import AssistantsSection from "../../components/settings/AssistantsSection";
import AgentsSection from "../../components/settings/AgentsSection";
import CustomSelect from "../../components/settings/CustomSelect";

type ShortcutKey = "quickLaunchShortcut";

interface RecordingState {
  key: ShortcutKey;
  binding: string[];
}

// Map event codes to display names
const keyDisplayMap: Record<string, string> = {
  Command: "⌘",
  Control: "⌃",
  Shift: "⇧",
  Alt: "⌥",
  Space: "Space",
  Enter: "↵",
  Backspace: "⌫",
  Tab: "⇥",
  Escape: "Esc",
};

function eventToKeys(e: React.KeyboardEvent): string[] {
  const keys: string[] = [];
  if (e.metaKey) keys.push("Command");
  if (e.ctrlKey) keys.push("Control");
  if (e.altKey) keys.push("Alt");
  if (e.shiftKey) keys.push("Shift");

  // Ignore modifier-only presses
  const key = e.key;
  const isModifier = ["Meta", "Control", "Alt", "Shift"].includes(key);
  if (!isModifier) {
    keys.push(key === " " ? "Space" : key);
  }

  return keys;
}

function formatShortcut(binding: string[]): string {
  return binding.map((k) => keyDisplayMap[k] || k).join(" + ");
}

function bindingToAccelerator(binding: string[]): string {
  return binding
    .map((k) => {
      if (k === "Command") return "Command";
      if (k === "Control") return "Control";
      if (k === "Shift") return "Shift";
      if (k === "Alt") return "Alt";
      if (k === "Space") return "Space";
      return k;
    })
    .join("+");
}

const SIDEBAR_SECTIONS = ["Models", "Assistants", "Agents", "Quick Launch", "Shortcuts", "About"] as const;
type Section = (typeof SIDEBAR_SECTIONS)[number];

function SectionLink({
  name,
  active,
  onSelect,
}: {
  name: Section;
  active: boolean;
  onSelect: (s: Section) => void;
}) {
  return (
    <button
      onClick={() => onSelect(name)}
      className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors ${
        active
          ? "bg-indigo-50 text-indigo-600 font-medium"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {name}
    </button>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const [settings, setSettingsState] = useState(() => getSettings());
  const [activeSection, setActiveSection] = useState<Section>("Models");
  const [recording, setRecording] = useState<RecordingState | null>(null);
  const recordRef = useRef<HTMLDivElement>(null);

  const refreshSettings = useCallback(() => {
    setSettingsState(getSettings());
  }, []);

  const startRecording = useCallback((key: ShortcutKey) => {
    setRecording({ key, binding: [] });
  }, []);

  // Focus the recording element when recording starts
  useEffect(() => {
    if (recording) {
      recordRef.current?.focus();
    }
  }, [recording]);

  const handleRecordKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();

      const keys = eventToKeys(e);
      if (keys.length === 0) return;

      const MODIFIERS = ["Command", "Control", "Alt", "Shift"];
      const hasModifier = keys.some((k) => MODIFIERS.includes(k));
      const hasActionKey = keys.some((k) => !MODIFIERS.includes(k));

      // Complete recording: requires modifier(s) + at least one action key
      if (hasModifier && hasActionKey) {
        const accelerator = bindingToAccelerator(keys);
        saveSettings({ quickLaunchShortcut: accelerator });
        invoke("set_shortcut", { shortcut: accelerator });
        setRecording(null);
        refreshSettings();
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        // Single key without modifiers -> cancel recording
        setRecording(null);
      } else {
        // Update displayed keys
        setRecording({ ...recording, binding: keys });
      }
    },
    [recording, refreshSettings],
  );

  // Close recording on Escape
  useEffect(() => {
    if (!recording) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRecording(null);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [recording]);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 h-12 border-b border-gray-200 bg-white shrink-0">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <SnowflakeIcon className="w-5 h-5 text-indigo-400" />
        <h1 className="text-sm font-medium text-gray-800">Settings</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-44 shrink-0 border-r border-gray-200 bg-white p-3">
          <nav className="flex flex-col gap-1">
            {SIDEBAR_SECTIONS.map((section) => (
              <SectionLink
                key={section}
                name={section}
                active={activeSection === section}
                onSelect={setActiveSection}
              />
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-h-0 flex flex-col">
          {/* Models Section — full-height three-panel */}
          {activeSection === "Models" && <ModelsSection key={activeSection} />}

          {/* Assistants Section — full-height two-panel */}
          {activeSection === "Assistants" && <AssistantsSection key={activeSection} />}

          {/* Agents Section — full-height two-panel */}
          {activeSection === "Agents" && <AgentsSection key={activeSection} />}

          {/* Quick Launch Section */}
          {activeSection === "Quick Launch" && (
            <div className="flex-1 overflow-y-auto p-6">
              <section>
                <h2 className="text-sm font-semibold text-gray-800 mb-4">
                  Quick Launch
                </h2>
                <div className="space-y-3 max-w-xl">
                  {/* Enable Quick Launch */}
                  <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        Enable Quick Launch
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Global shortcut to quickly ask a question
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const next = !settings.quickLaunchEnabled;
                        saveSettings({ quickLaunchEnabled: next });
                        invoke("set_quick_launch_enabled", { enabled: next });
                        refreshSettings();
                      }}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        settings.quickLaunchEnabled ? "bg-indigo-500" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${
                          settings.quickLaunchEnabled ? "right-0.5" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Read Clipboard on Launch */}
                  <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        Read Clipboard on Launch
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Load latest clipboard text into the input field
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        saveSettings({ quickLaunchReadClipboard: !settings.quickLaunchReadClipboard });
                        refreshSettings();
                      }}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        settings.quickLaunchReadClipboard ? "bg-indigo-500" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                          settings.quickLaunchReadClipboard ? "right-0.5" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Quick Launch Assistant */}
                  <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Quick Launch Assistant
                    </p>
                    <p className="text-xs text-gray-400 mb-2">
                      Select which assistant to use for quick launch
                    </p>
                    <CustomSelect
                      value={settings.quickLaunchAssistantId ?? ""}
                      options={[
                        { value: "", label: "None" },
                        ...settings.assistants.map((a) => ({ value: a.id, label: a.name })),
                      ]}
                      onChange={(val) => {
                        saveSettings({ quickLaunchAssistantId: val || null });
                        refreshSettings();
                      }}
                      placeholder="None"
                    />
                    {settings.assistants.length === 0 && (
                      <p className="text-[10px] text-gray-400 mt-2">
                        No assistants available — create one in the Assistants tab
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* Shortcuts Section */}
          {activeSection === "Shortcuts" && (
            <div className="flex-1 overflow-y-auto p-6">
              <section>
                <h2 className="text-sm font-semibold text-gray-800 mb-4">
                  Keyboard Shortcuts
                </h2>

                <div className="space-y-3 max-w-xl">
                  {/* Quick Launch Shortcut */}
                  <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        Quick Launch
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Show or hide the quick ask window
                      </p>
                    </div>

                    {recording && recording.key === "quickLaunchShortcut" ? (
                      <div
                        ref={recordRef}
                        tabIndex={0}
                        onKeyDown={handleRecordKeyDown}
                        className="px-3 py-1.5 text-xs font-mono bg-indigo-50 border border-indigo-300 rounded-md text-indigo-600 outline-none min-w-[120px] text-center animate-pulse"
                      >
                        {recording.binding.length > 0
                          ? formatShortcut(recording.binding)
                          : "Press shortcut..."}
                      </div>
                    ) : (
                      <button
                        onClick={() => startRecording("quickLaunchShortcut")}
                        className="px-3 py-1.5 text-xs font-mono bg-gray-50 border border-gray-200 rounded-md text-gray-600 hover:border-gray-300 hover:bg-gray-100 transition-colors"
                      >
                        {formatShortcut(
                          settings.quickLaunchShortcut
                            .split("+")
                            .map((s) => s.trim()),
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* About Section */}
          {activeSection === "About" && (
            <div className="flex-1 overflow-y-auto p-6">
              <section>
                <h2 className="text-sm font-semibold text-gray-800 mb-4">About</h2>
                <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 max-w-xl">
                  <p className="text-sm text-gray-600">Asumi Agent v0.1.0</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Pre-alpha development version
                  </p>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
