import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import SnowflakeIcon from "../components/SnowflakeIcon";

export default function Home() {
  const navigate = useNavigate();

  function greet() {
    invoke("greet", { name: "先輩" }).then((msg) => {
      const el = document.getElementById("greet-msg");
      if (el) el.textContent = msg as string;
    });
  }

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-b from-sky-50 to-white select-none">
      {/* Snowflake icon */}
      <SnowflakeIcon className="w-16 h-16 mb-4 text-sky-400/60" />

      {/* Title */}
      <h1 className="text-2xl font-light text-gray-700 tracking-wide mb-1">
        Asumi Agent
      </h1>
      <p className="text-sm text-gray-400 mb-8">
        先輩、お待ちしてました
      </p>

      {/* Quote */}
      <div className="max-w-md text-center px-6">
        <p className="text-xs text-gray-400 italic leading-relaxed">
          「男性は少し苦手です。先輩からは、いやらしさを感じなかったので……。」
        </p>
      </div>

      {/* Status */}
      <div className="mt-10 flex items-center gap-2 text-xs text-gray-300">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        v0.1.0 — pre-alpha
      </div>

      {/* Actions */}
      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={greet}
          className="px-4 py-1.5 text-xs text-gray-300 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
        >
          Say hello
        </button>

        <button
          onClick={() => navigate("/settings")}
          className="px-4 py-1.5 text-xs text-gray-300 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
        >
          Settings
        </button>
      </div>
      <p id="greet-msg" className="mt-2 text-xs text-gray-400" />
    </div>
  );
}
