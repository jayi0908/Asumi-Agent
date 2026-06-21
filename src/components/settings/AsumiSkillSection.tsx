import { useState, useCallback } from "react";
import { getSettings, saveSettings } from "../../stores/settings";
import CustomSelect from "./CustomSelect";

export default function AsumiSkillSection() {
  const [settings, setSettings] = useState(() => getSettings());

  const refresh = useCallback(() => setSettings(getSettings()), []);

  const configOptions = [
    { value: "default", label: "Asumi (亚澄) — default" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <section>
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Asumi Skill</h2>
        <p className="text-xs text-gray-400 mb-4 max-w-xl">
          When enabled, the character style guide is merged into the assistant&apos;s
          system prompt so responses come out in-character in a single streaming call.
          Code blocks and math formulas are preserved untouched.
        </p>

        <div className="space-y-3 max-w-xl">
          {/* Enable Asumi Skill */}
          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Enable Asumi Skill
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Responses will be styled in character voice
              </p>
            </div>
            <button
              onClick={() => {
                saveSettings({ enableAsumiSkill: !settings.enableAsumiSkill });
                refresh();
              }}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                settings.enableAsumiSkill ? "bg-indigo-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${
                  settings.enableAsumiSkill ? "right-0.5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Character Config */}
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Character Config
            </p>
            <p className="text-xs text-gray-400 mb-2">
              Select the character profile to use. Edit the JSON file at{" "}
              <code className="text-[10px] bg-gray-100 px-1 rounded">
                public/character-configs/default.json
              </code>{" "}
              to customize tone, speech patterns, and formatting rules.
            </p>
            <CustomSelect
              value={settings.skillCharacterConfigId}
              options={configOptions}
              onChange={(val) => {
                saveSettings({ skillCharacterConfigId: val });
                refresh();
              }}
            />
          </div>

          {/* Config Status */}
          <div className="flex items-center bg-white rounded-lg border border-gray-200 px-4 py-3">
            <span
              className={`w-2 h-2 rounded-full mr-2 ${
                settings.enableAsumiSkill ? "bg-green-400" : "bg-gray-300"
              }`}
            />
            <p className="text-xs text-gray-500">
              {settings.enableAsumiSkill
                ? "Ready — responses will be styled in character voice"
                : "Asumi Skill is disabled"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
