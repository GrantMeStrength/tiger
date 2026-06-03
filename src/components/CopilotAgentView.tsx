"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidBlock } from "./MermaidBlock";

interface Props {
  agentId: string;
  isActive: boolean;
  onExit?: (agentId: string, exitCode: number) => void;
}

type MessageItem =
  | { id: string; kind: "user"; content: string }
  | { id: string; kind: "assistant"; content: string; streaming: boolean }
  | { id: string; kind: "tool"; toolId: string; name: string; status: "running" | "done" | "error"; input?: unknown; output?: unknown; errorMsg?: string }
  | { id: string; kind: "status"; text: string };

type CopilotEvent = {
  type: string;
  data?: {
    // user.message / assistant.message
    content?: string;
    // assistant.message_delta
    deltaContent?: string;
    // tool.execution_start
    toolCallId?: string;
    toolName?: string;
    arguments?: unknown;
    // tool.execution_complete
    result?: { content?: string };
    error?: { message?: string } | null;
    success?: boolean;
  };
};

type ViewState = {
  messages: MessageItem[];
  isIdle: boolean;
  streamingId: string | null;
  pendingPrompts: string[];
};

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stringifyValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}


const WAVEFORM_COLS = 24;
const WAVEFORM_BARS = ['▁','▂','▃','▄','▅','▆','▇','█'];

function ActivityWaveform({ active }: { active: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(t => t + 1), 70);
    return () => clearInterval(id);
  }, [active]);

  const cols = Array.from({ length: WAVEFORM_COLS }, (_, i) => {
    const v = Math.sin(tick * 0.25 + i * 0.6) * 0.5 + Math.sin(tick * 0.4 + i * 1.1) * 0.5;
    const idx = Math.round(((v + 1) / 2) * (WAVEFORM_BARS.length - 1));
    return WAVEFORM_BARS[idx];
  });

  return (
    <div style={{
      padding: "4px 20px",
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      letterSpacing: "0.15em",
      color: active ? "rgba(255,208,64,0.7)" : "rgba(255,184,0,0.15)",
      transition: "color 0.6s",
      userSelect: "none",
    }}>
      {cols.join('')}
    </div>
  );
}

function labelForUrl(url: string): string {
  const pr = url.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
  if (pr) return `PR #${pr[1]}`;
  const issue = url.match(/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/);
  if (issue) return `Issue #${issue[1]}`;
  const commit = url.match(/github\.com\/[^/]+\/[^/]+\/commit\/([a-f0-9]{7})/);
  if (commit) return `Commit ${commit[1]}`;
  const blob = url.match(/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\/(.+)/);
  if (blob) return (blob[1].split("/").pop() ?? url).slice(0, 28);
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    return (u.hostname + path).slice(0, 28);
  } catch {
    return url.slice(0, 28);
  }
}

function extractLinks(messages: MessageItem[]): Array<{ url: string; label: string }> {
  const urlRegex = /https?:\/\/[^\s)"'`>,]+/g;
  const seen = new Set<string>();
  const links: Array<{ url: string; label: string }> = [];
  for (const msg of messages) {
    let text = "";
    if (msg.kind === "assistant") text = msg.content;
    else if (msg.kind === "tool") text = stringifyValue(msg.output);
    for (const raw of text.match(urlRegex) ?? []) {
      const url = raw.replace(/[.,;:!?)]+$/, "");
      if (seen.has(url)) continue;
      seen.add(url);
      links.push({ url, label: labelForUrl(url) });
    }
  }
  return links;
}

function LinksPanel({ links }: { links: Array<{ url: string; label: string }> }) {
  return (
    <div style={{
      width: 190,
      minWidth: 190,
      borderLeft: "1px solid rgba(255,184,0,0.15)",
      display: "flex",
      flexDirection: "column",
      background: "rgba(0,0,0,0.3)",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      overflowY: "auto",
    }}>
      <div style={{
        padding: "8px 12px 6px",
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "rgba(255,184,0,0.45)",
        borderBottom: "1px solid rgba(255,184,0,0.1)",
        userSelect: "none",
      }}>
        links
      </div>
      {links.length === 0 ? (
        <div style={{ padding: "10px 12px", color: "rgba(255,184,0,0.2)", fontSize: 11 }}>
          none yet
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 0" }}>
          {links.map(({ url, label }) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              title={url}
              style={{
                display: "block",
                padding: "4px 12px",
                color: "#ffd040",
                textDecoration: "none",
                lineHeight: 1.5,
                wordBreak: "break-all",
                borderLeft: "2px solid transparent",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderLeftColor = "#ffd040";
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,208,64,0.07)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderLeftColor = "transparent";
                (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
              }}
            >
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function statusIcon(status: "running" | "done" | "error") {
  if (status === "running") return "⋯";
  if (status === "done") return "✓";
  return "✕";
}

export default function CopilotAgentView({ agentId, isActive }: Props) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [input, setInput] = useState("");
  const [isIdle, setIsIdle] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionNotFound, setSessionNotFound] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectRef = useRef<() => void>(() => {});
  const bottomRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ViewState>({
    messages: [],
    isIdle: true,
    streamingId: null,
    pendingPrompts: [],
  });

  const syncState = useCallback((next: ViewState) => {
    stateRef.current = next;
    setMessages(next.messages);
    setIsIdle(next.isIdle);
    setStreamingId(next.streamingId);
  }, []);

  const pushStatus = useCallback((text: string) => {
    const next: ViewState = {
      ...stateRef.current,
      messages: [...stateRef.current.messages, { id: makeId(), kind: "status", text }],
    };
    syncState(next);
  }, [syncState]);

  const applyEvent = useCallback((current: ViewState, event: CopilotEvent): ViewState => {
    const next: ViewState = {
      messages: [...current.messages],
      isIdle: current.isIdle,
      streamingId: current.streamingId,
      pendingPrompts: [...current.pendingPrompts],
    };

    const data = event.data ?? {};
    const last = () => next.messages[next.messages.length - 1];

    if (event.type === "user.message") {
      const content = typeof data.content === "string" ? data.content : "";
      next.isIdle = false;
      const previous = last();
      if (
        next.pendingPrompts[0] === content
        && previous?.kind === "user"
        && previous.content === content
      ) {
        next.pendingPrompts.shift();
      } else {
        next.messages.push({ id: makeId(), kind: "user", content });
      }
      return next;
    }

    if (event.type === "assistant.message_delta") {
      const deltaContent = typeof data.deltaContent === "string" ? data.deltaContent : "";
      next.isIdle = false;
      const previous = last();
      if (previous?.kind === "assistant" && previous.streaming) {
        next.messages[next.messages.length - 1] = {
          ...previous,
          content: previous.content + deltaContent,
        };
        next.streamingId = previous.id;
      } else {
        const id = makeId();
        next.messages.push({ id, kind: "assistant", content: deltaContent, streaming: true });
        next.streamingId = id;
      }
      return next;
    }

    if (event.type === "assistant.message") {
      const content = typeof data.content === "string" ? data.content : "";
      next.isIdle = false;
      const previous = last();
      if (previous?.kind === "assistant" && previous.streaming) {
        next.messages[next.messages.length - 1] = {
          ...previous,
          content,
          streaming: false,
        };
      } else {
        next.messages.push({ id: makeId(), kind: "assistant", content, streaming: false });
      }
      next.streamingId = null;
      return next;
    }

    if (event.type === "tool.execution_start") {
      next.isIdle = false;
      next.messages.push({
        id: makeId(),
        kind: "tool",
        toolId: typeof data.toolCallId === "string" ? data.toolCallId : makeId(),
        name: typeof data.toolName === "string" ? data.toolName : "tool",
        status: "running",
        input: data.arguments,
      });
      return next;
    }

    if (event.type === "tool.execution_complete") {
      next.isIdle = false;
      const toolId = typeof data.toolCallId === "string" ? data.toolCallId : undefined;
      const matchIndex = [...next.messages]
        .map((message, index) => ({ message, index }))
        .reverse()
        .find(({ message }) => (
          message.kind === "tool"
          && message.status === "running"
          && (!toolId || message.toolId === toolId)
        ))?.index;

      const hasError = data.success === false || !!data.error;
      const status = hasError ? "error" : "done";
      const output = data.result?.content;
      const errorMsg = typeof data.error?.message === "string" ? data.error.message : undefined;

      if (matchIndex !== undefined) {
        const message = next.messages[matchIndex];
        if (message?.kind === "tool") {
          next.messages[matchIndex] = { ...message, status, output, errorMsg };
        }
      } else {
        next.messages.push({
          id: makeId(),
          kind: "tool",
          toolId: toolId ?? makeId(),
          name: "tool",
          status,
          output,
          errorMsg,
        });
      }
      return next;
    }

    if (event.type === "session.idle") {
      const previous = last();
      if (previous?.kind === "assistant" && previous.streaming) {
        next.messages[next.messages.length - 1] = {
          ...previous,
          streaming: false,
        };
      }
      next.isIdle = true;
      next.streamingId = null;
      return next;
    }

    return next;
  }, []);

  const processEvent = useCallback((event: CopilotEvent) => {
    syncState(applyEvent(stateRef.current, event));
  }, [applyEvent, syncState]);

  const processEvents = useCallback((events: CopilotEvent[], idleOverride?: boolean) => {
    let next: ViewState = {
      messages: [],
      isIdle: true,
      streamingId: null,
      pendingPrompts: [],
    };
    for (const event of events) {
      next = applyEvent(next, event);
    }
    // session.idle is ephemeral (not in history); use server-reported value when provided
    if (typeof idleOverride === "boolean") {
      next = { ...next, isIdle: idleOverride };
    }
    syncState(next);
  }, [applyEvent, syncState]);

  const cleanupSocket = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      const socket = wsRef.current;
      wsRef.current = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
    }
  }, []);

  const connect = useCallback(() => {
    cleanupSocket();
    setSessionNotFound(false);
    pushStatus("connecting...");

    const socket = new WebSocket(`ws://${window.location.host}/ws/copilot/${agentId}`);
    wsRef.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    socket.onmessage = (message) => {
      try {
        const payload = JSON.parse(String(message.data));
        if (payload.type === "connected") {
          setIsConnected(true);
          setSessionNotFound(false);
          reconnectAttemptsRef.current = 0;
          const history: CopilotEvent[] = Array.isArray(payload.history) ? payload.history : [];
          // session.idle is ephemeral and not in history; use server-reported idle state
          const idle = typeof payload.isIdle === "boolean" ? payload.isIdle : true;
          processEvents(history, idle);
          return;
        }
        if (payload.type === "event") {
          processEvent(payload.event as CopilotEvent);
          return;
        }
        if (payload.type === "not_found") {
          setIsConnected(false);
          cleanupSocket();
          // cleanupSocket triggers onclose which schedules a retry;
          // sessionNotFound UI is set only after all retries are exhausted (see onclose)
        }
      } catch {
        pushStatus("failed to parse server message");
      }
    };

    socket.onclose = () => {
      wsRef.current = null;
      setIsConnected(false);
      if (!isActive) return;
      if (reconnectAttemptsRef.current >= 5) {
        setSessionNotFound(true);
        pushStatus("session not found — use ↺ Restart to reconnect");
        return;
      }
      reconnectAttemptsRef.current += 1;
      // Use longer delays so server has time to finish restoring sessions
      const delay = reconnectAttemptsRef.current <= 2 ? 2000 : 4000;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connectRef.current();
      }, delay);
    };

    socket.onerror = () => {
      setIsConnected(false);
    };
  }, [agentId, cleanupSocket, isActive, processEvent, processEvents, pushStatus]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!isActive) {
      cleanupSocket();
      return;
    }
    const timeout = setTimeout(() => {
      connectRef.current();
    }, 0);
    return () => {
      clearTimeout(timeout);
      cleanupSocket();
    };
  }, [cleanupSocket, isActive]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isConnected, streamingId]);

  const handleSend = useCallback(() => {
    const prompt = input.trim();
    if (!prompt || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !isIdle) return;

    const next: ViewState = {
      ...stateRef.current,
      messages: [...stateRef.current.messages, { id: makeId(), kind: "user", content: prompt }],
      isIdle: false,
      pendingPrompts: [...stateRef.current.pendingPrompts, prompt],
    };
    syncState(next);
    wsRef.current.send(JSON.stringify({ type: "send", prompt }));
    setInput("");
  }, [input, isIdle, syncState]);

  const handleAbort = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "abort" }));
  }, []);

  const canSend = useMemo(
    () => Boolean(input.trim()) && isIdle && isConnected,
    [input, isConnected, isIdle]
  );

  const links = useMemo(() => extractLinks(messages), [messages]);

  const AMBER = "#ffd040";
  const DIM   = "rgba(255,184,0,0.35)";

  return (
    <div className="crt-screen crt-amber" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row", background: "#09090b", position: "relative" }}>
      {/* CRT overlay effects */}
      <div className="crt-scanlines" />
      <div className="crt-vignette" />

      {/* Chat column */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Message log */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4, fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.6 }}>
        {messages.length === 0 && (
          <div style={{ margin: "auto", color: DIM, fontSize: 12, textAlign: "center", lineHeight: 1.8, fontFamily: "var(--font-mono)" }}>
            {sessionNotFound
              ? <>session not found<br /><span style={{ color: AMBER }}>↺ restart</span> to reconnect</>
              : isConnected ? "ready — type a message below" : "connecting…"}
          </div>
        )}

        {messages.map((message) => {
          if (message.kind === "status") {
            return (
              <div key={message.id} style={{ color: DIM, fontSize: 11, paddingLeft: 2 }}>
                -- {message.text}
              </div>
            );
          }

          if (message.kind === "user") {
            return (
              <div key={message.id} style={{ color: AMBER, whiteSpace: "pre-wrap", marginTop: 8 }}>
                <span style={{ opacity: 0.55 }}>&gt; </span>{message.content}
              </div>
            );
          }

          if (message.kind === "assistant") {
            return (
              <div key={message.id} style={{ color: AMBER, marginTop: 4 }}>
                <div className="copilot-markdown" style={{ whiteSpace: "pre-wrap" }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      code({ className, children, ...props }: any) {
                        const lang = (className ?? "").replace("language-", "");
                        const src = String(children).replace(/\n$/, "");
                        if (lang === "mermaid") return <MermaidBlock code={src} />;
                        return <code className={className} {...props}>{children}</code>;
                      },
                    }}
                  >{message.content}</ReactMarkdown>
                </div>
                {message.streaming && <span style={{ color: AMBER }}>▍</span>}
              </div>
            );
          }

          // tool call
          const toolColor = message.status === "error" ? "#ff4444" : message.status === "done" ? AMBER : DIM;
          return (
            <details
              key={message.id}
              style={{ marginTop: 4, borderLeft: `2px solid ${toolColor}`, paddingLeft: 10 }}
            >
              <summary style={{ listStyle: "none", cursor: "pointer", color: toolColor, fontSize: 12, userSelect: "none" }}>
                {statusIcon(message.status)} {message.name}
                <span style={{ opacity: 0.5, marginLeft: 8, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em" }}>{message.status}</span>
              </summary>
              <div style={{ paddingTop: 6, display: "grid", gap: 6 }}>
                {message.input !== undefined && (
                  <pre style={{ ...toolBlockStyle, background: "rgba(255,184,0,0.05)", color: "rgba(255,184,0,0.7)", border: "1px solid rgba(255,184,0,0.15)" }}>{stringifyValue(message.input)}</pre>
                )}
                {message.output !== undefined && (
                  <pre style={{ ...toolBlockStyle, background: "rgba(255,184,0,0.05)", color: "rgba(255,184,0,0.7)", border: "1px solid rgba(255,184,0,0.15)" }}>{stringifyValue(message.output)}</pre>
                )}
                {message.errorMsg && (
                  <pre style={{ ...toolBlockStyle, background: "rgba(255,68,68,0.06)", color: "#ff6666", border: "1px solid rgba(255,68,68,0.2)" }}>{message.errorMsg}</pre>
                )}
              </div>
            </details>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Activity waveform */}
      <ActivityWaveform active={!isIdle} />

      {/* Input bar */}
      <div style={{ borderTop: `1px solid rgba(255,184,0,0.2)`, padding: "10px 14px", background: "rgba(0,0,0,0.6)", display: "flex", gap: 8, alignItems: "flex-end" }}>
        <span style={{ color: AMBER, fontFamily: "var(--font-mono)", fontSize: 14, lineHeight: "1", paddingBottom: 9, opacity: 0.9 }}>▸</span>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            sessionNotFound ? "session not found — use ↺ Restart above"
            : isConnected ? (isIdle ? "type a message…" : "waiting for response…")
            : "connecting…"
          }
          rows={2}
          disabled={!isConnected}
          style={{
            flex: 1,
            resize: "none",
            padding: "8px 10px",
            borderRadius: 4,
            border: `1px solid rgba(255,184,0,0.25)`,
            background: "rgba(255,184,0,0.04)",
            color: AMBER,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            lineHeight: 1.5,
            outline: "none",
          }}
        />
        {!isIdle && (
          <button type="button" onClick={handleAbort} style={{ ...secondaryButtonStyle, fontFamily: "var(--font-mono)", fontSize: 11 }}>
            abort
          </button>
        )}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          style={{
            ...primaryButtonStyle,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            background: canSend ? "rgba(255,184,0,0.15)" : "transparent",
            border: `1px solid ${canSend ? AMBER : "rgba(255,184,0,0.2)"}`,
            color: canSend ? AMBER : DIM,
            opacity: 1,
            cursor: canSend ? "pointer" : "not-allowed",
            borderRadius: 4,
          }}
        >
          send ↵
        </button>
      </div>
      </div>
      {/* Links panel */}
      <LinksPanel links={links} />
    </div>
  );
}

const toolBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: 8,
  background: "var(--color-bg)",
  border: "1px solid var(--color-border-subtle)",
  color: "var(--color-text-muted)",
  fontSize: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowX: "auto",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  background: "var(--color-accent)",
  color: "white",
  fontWeight: 600,
  fontSize: 13,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid var(--color-border)",
  background: "transparent",
  color: "var(--color-text-muted)",
  fontSize: 13,
  cursor: "pointer",
};
