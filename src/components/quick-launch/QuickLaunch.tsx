import { useState, useRef, useEffect, useCallback } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { invoke, Channel } from "@tauri-apps/api/core";
import { getSettings, getAssistant, getAssistantApiConfig } from "../../stores/settings";
import SnowflakeIcon from "../SnowflakeIcon";

// Loaded once per mount — holds the parsed character config for the formatter.
let characterConfigCache: object | null = null;
let characterConfigLoaded = false;

const appWindow = getCurrentWebviewWindow();
const QUICK_LAUNCH_WIDTH = 420;
const COLLAPSED_HEIGHT = 56;
const EXPANDED_MAX_HEIGHT = 340;

interface Message {
  role: "user" | "assistant";
  content: string;
  id?: string;
}

export default function QuickLaunch() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const clipboardReadRef = useRef(false);
  const hasMessages = messages.length > 0;

  const hideQuickLaunch = useCallback(() => {
    setInput("");
    setMessages([]);
    clipboardReadRef.current = false;
    appWindow.hide().catch(() => undefined);
  }, []);

  // Auto-focus input and hide the quick window when it loses focus.
  useEffect(() => {
    inputRef.current?.focus();

    const unlisten = appWindow.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        if (hideTimerRef.current !== null) {
          window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        inputRef.current?.focus();

        // Read clipboard on launch if enabled
        if (!clipboardReadRef.current) {
          clipboardReadRef.current = true;
          const settings = getSettings();
          if (settings.quickLaunchReadClipboard) {
            invoke<string>("read_clipboard")
              .then((text) => {
                if (text) setInput(text);
              })
              .catch(() => undefined);
          }
        }
      } else {
        hideTimerRef.current = window.setTimeout(hideQuickLaunch, 100);
      }
    });

    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      unlisten.then((fn) => fn());
    };
  }, [hideQuickLaunch]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Keep the native window height matched to the rendered content.
  useEffect(() => {
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      const contentHeight = panelRef.current?.scrollHeight ?? COLLAPSED_HEIGHT;
      const nextHeight = hasMessages
        ? Math.min(Math.max(contentHeight, COLLAPSED_HEIGHT), EXPANDED_MAX_HEIGHT)
        : COLLAPSED_HEIGHT;

      appWindow
        .setSize(new LogicalSize(QUICK_LAUNCH_WIDTH, nextHeight))
        .catch(() => undefined);
    });

    return () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [hasMessages, messages]);

  // Preload character config on mount
  useEffect(() => {
    if (characterConfigLoaded) return;
    characterConfigLoaded = true;
    fetch("/character-configs/default.json")
      .then((r) => r.json())
      .then((cfg) => {
        characterConfigCache = cfg;
      })
      .catch(() => {
        characterConfigCache = null;
      });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");

    const qlId = getSettings().quickLaunchAssistantId;
    const assistant = qlId ? getAssistant(qlId) : null;
    const config = qlId ? getAssistantApiConfig(qlId) : null;
    if (!config) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMsg },
        { role: "assistant", content: "请在设置中配置快捷助手~" },
      ]);
      return;
    }

    const settings = getSettings();
    const pendingId = Date.now().toString();

    // --- Asumi Skill: single merged streaming call ---
    if (settings.enableAsumiSkill && characterConfigCache) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMsg },
        { role: "assistant", content: "", id: pendingId },
      ]);

      const channel = new Channel<string>();
      channel.onmessage = (token: string) => {
        setMessages((prev) =>
          prev.map((msg) =>
            "id" in msg && msg.id === pendingId
              ? { role: "assistant" as const, content: msg.content + token, id: pendingId }
              : msg,
          ),
        );
      };

      invoke<string>("stream_submit_message", {
        message: userMsg,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        systemPrompt: assistant?.systemPrompt ?? "",
        onChunk: channel,
        characterConfig: JSON.stringify(characterConfigCache),
      }).catch((err) => {
        setMessages((prev) =>
          prev.map((msg) =>
            "id" in msg && msg.id === pendingId
              ? { role: "assistant" as const, content: String(err) }
              : msg,
          ),
        );
      });
      return;
    }

    // --- Normal flow (streaming, no character style) ---
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMsg },
      { role: "assistant", content: "", id: pendingId },
    ]);

    const channel = new Channel<string>();
    channel.onmessage = (token: string) => {
      setMessages((prev) =>
        prev.map((msg) =>
          "id" in msg && msg.id === pendingId
            ? { role: "assistant" as const, content: msg.content + token, id: pendingId }
            : msg,
        ),
      );
    };

    invoke<string>("stream_submit_message", {
      message: userMsg,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      systemPrompt: assistant?.systemPrompt ?? "",
      onChunk: channel,
    }).catch((err) => {
      setMessages((prev) =>
        prev.map((msg) =>
          "id" in msg && msg.id === pendingId
            ? { role: "assistant" as const, content: String(err) }
            : msg,
        ),
      );
    });
  }, [input]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        hideQuickLaunch();
      }
    },
    [handleSubmit, hideQuickLaunch],
  );

  return (
    <div
      ref={panelRef}
      className={`w-screen max-h-[340px] flex flex-col overflow-hidden border border-white/70 bg-white/95 shadow-2xl backdrop-blur-xl transition-[border-radius] duration-150 ${
        hasMessages ? "rounded-[24px]" : "rounded-[28px]"
      }`}
    >
      {/* Messages area — only visible when there's conversation */}
      {hasMessages && (
        <div className="max-h-[284px] overflow-y-auto px-3 pt-3 pb-2 space-y-2 scroll-smooth">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`text-sm leading-relaxed max-w-[80%] px-3.5 py-2 ${
                  msg.role === "user"
                    ? "bg-indigo-500 text-white rounded-2xl rounded-br-md"
                    : "bg-gray-100 text-gray-600 rounded-2xl rounded-bl-md"
                } ${msg.content === "..." ? "animate-pulse" : ""}`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input bar */}
      <div className="h-14 shrink-0 flex items-center gap-2 px-3">
        <div
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100/80 text-sky-500"
          aria-hidden="true"
        >
          <SnowflakeIcon className="w-[18px] h-[18px]" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="有什么想问亚澄的吗~"
          className="flex-1 min-w-0 text-[15px] text-gray-700 placeholder-gray-400 bg-transparent border-none outline-none focus:outline-none"
        />

        <span className="shrink-0 max-w-28 truncate text-sm font-semibold text-gray-700">
          {(() => {
            const qlId = getSettings().quickLaunchAssistantId;
            const assistant = qlId ? getAssistant(qlId) : null;
            return assistant?.name ?? "未配置";
          })()}
        </span>
      </div>
    </div>
  );
}
