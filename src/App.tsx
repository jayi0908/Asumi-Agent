import { HashRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getSettings } from "./stores/settings";
import "./App.css";
import QuickLaunch from "./components/quick-launch/QuickLaunch";
import Settings from "./pages/settings/Settings";
import Home from "./pages/Home";

const appWindow = getCurrentWebviewWindow();

function App() {
  const [isQuickLaunch, setIsQuickLaunch] = useState(false);

  useEffect(() => {
    setIsQuickLaunch(appWindow.label === "quick-launch");
  }, []);

  // Sync the saved global shortcut to the Rust backend on startup
  useEffect(() => {
    if (!isQuickLaunch) {
      const settings = getSettings();
      if (settings.quickLaunchShortcut !== "Command+Shift+Space") {
        invoke("set_shortcut", { shortcut: settings.quickLaunchShortcut });
      }
    }
  }, [isQuickLaunch]);

  // Quick launch window gets the minimal UI
  if (isQuickLaunch) {
    return <QuickLaunch />;
  }

  // Main window gets the full app with routing
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
