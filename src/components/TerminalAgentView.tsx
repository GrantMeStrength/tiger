// No "use client" — this is dynamically imported only on the client
import { useEffect, useRef, useState } from "react";
import "xterm/css/xterm.css";

const THEMES = {
  green: {
    // P1 phosphor — classic green
    background: "#050e05",
    foreground: "#33ff33",
    cursor: "#33ff33",
    cursorAccent: "#050e05",
    selectionBackground: "#33ff3340",
    black: "#0a1a0a",
    red: "#ff3333",
    green: "#33ff33",
    yellow: "#ffff33",
    blue: "#3399ff",
    magenta: "#cc33ff",
    cyan: "#33ffcc",
    white: "#99ff99",
    brightBlack: "#1a331a",
    brightRed: "#ff6666",
    brightGreen: "#66ff66",
    brightYellow: "#ffff66",
    brightBlue: "#66bbff",
    brightMagenta: "#dd66ff",
    brightCyan: "#66ffdd",
    brightWhite: "#ccffcc",
  },
  amber: {
    // P3 phosphor — amber
    background: "#0d0800",
    foreground: "#ffb000",
    cursor: "#ffb000",
    cursorAccent: "#0d0800",
    selectionBackground: "#ffb00040",
    black: "#1a1000",
    red: "#ff4400",
    green: "#aacc00",
    yellow: "#ffcc00",
    blue: "#ffaa44",
    magenta: "#ff8800",
    cyan: "#ffdd88",
    white: "#ffcc88",
    brightBlack: "#332200",
    brightRed: "#ff6633",
    brightGreen: "#ccdd44",
    brightYellow: "#ffdd44",
    brightBlue: "#ffbb66",
    brightMagenta: "#ffaa44",
    brightCyan: "#ffeebb",
    brightWhite: "#fff0cc",
  },
} as const;

export default function TerminalAgentView({ agentId, isActive, phosphor = "green", onExit, onNotFound, showHistory = false, onHistoryToggle }: { agentId: string; isActive: boolean; phosphor?: "green" | "amber"; onExit?: (agentId: string, exitCode: number) => void; onNotFound?: (agentId: string) => void; showHistory?: boolean; onHistoryToggle?: (showing: boolean) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terminalRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitAddonRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visibilityHandlerRef = useRef<any>(null);
  // True once this xterm instance has received its initial scrollback replay from the server.
  // Subsequent reconnects (network drop, tab visibility) skip scrollback to avoid duplicates.
  const hasReceivedScrollbackRef = useRef(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [transcriptText, setTranscriptText] = useState<string>("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const showTranscript = showHistory;

  // Read the human-readable text from xterm's already-rendered buffer.
  // xterm has already interpreted all escape codes (cursor movement, colour, etc.)
  // so this gives clean plain text — far better than trying to parse raw PTY bytes.
  function readBufferText(): string {
    const term = terminalRef.current;
    if (!term) return "(terminal not ready)";
    const buffer = term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    // Trim trailing blank lines
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.join("\n");
  }

  // Populate transcript text whenever history panel is opened
  useEffect(() => {
    if (showHistory) {
      setTranscriptText(readBufferText());
      setTimeout(() => transcriptEndRef.current?.scrollIntoView(), 50);
    } else {
      terminalRef.current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistory]);

  useEffect(() => {
    // `alive` must be checked after EVERY await — Strict Mode cleanup fires before async imports resolve,
    // so checking only at the top is not sufficient.
    let alive = true;
    let sawExit = false; // set true when server sends exit control message; suppresses reconnect
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let terminal: any = null;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 8;

    function connectWs() {
      if (!alive) return;
      // Skip scrollback replay if this terminal instance already has its history loaded —
      // prevents duplicate output when reconnecting after a network drop or tab re-focus.
      const params = hasReceivedScrollbackRef.current ? "?skipScrollback=1" : "";
      ws = new WebSocket(`ws://${window.location.host}/ws/terminal/${agentId}${params}`);

      ws.onopen = () => {
        if (!alive) { ws?.close(); return; }
        reconnectAttempts = 0;
        // Send terminal size immediately; banner is written when server confirms connection
        ws!.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
        if (isActive) terminal.focus();
      };

      // Server sends PTY data as binary frames and control events as text (JSON) frames.
      ws.binaryType = "arraybuffer";
      ws.onmessage = (e) => {
        if (!alive) return;
        if (typeof e.data === "string") {
          // Control message (text frame)
          try {
            const ctrl = JSON.parse(e.data);
            if (ctrl.type === "connected") {
              // Server sends this after flushing scrollback — banner appears at current position
              hasReceivedScrollbackRef.current = true;
              terminal.write("\r\n\x1b[2;32m[Tiger] Terminal connected\x1b[0m\r\n\r\n");
            } else if (ctrl.type === "not_found") {
              sawExit = true; // suppress reconnect — PTY is gone (e.g. server restarted)
              terminal.write("\r\n\x1b[2;31m[Tiger] Session not found — use ↺ Relaunch to restart.\x1b[0m\r\n");
              onNotFound?.(agentId);
            } else if (ctrl.type === "exit") {
              sawExit = true;
              const code: number = ctrl.exitCode ?? 0;
              const colour = code === 0 ? "\x1b[2;32m" : "\x1b[2;31m";
              terminal.write(`\r\n${colour}[Tiger] Process exited with code ${code}\x1b[0m\r\n`);
              onExit?.(agentId, code);
            }
          } catch { /* ignore malformed text */ }
        } else {
          // Binary frame — raw PTY output
          terminal.write(new Uint8Array(e.data as ArrayBuffer));
        }
      };

      ws.onclose = () => {
        if (!alive) return;
        if (sawExit) return; // process finished cleanly — no reconnect
        if (reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++;
          const delay = Math.min(200 * reconnectAttempts, 2000);
          terminal.write(`\r\n\x1b[2;33m[Tiger] Reconnecting… (${reconnectAttempts}/${MAX_RECONNECT})\x1b[0m\r\n`);
          reconnectTimer = setTimeout(connectWs, delay);
        } else {
          terminal.write("\r\n\x1b[2;33m[Tiger] Connection closed\x1b[0m\r\n");
        }
      };

      ws.onerror = () => { if (alive) terminal.write("\r\n\x1b[2;31m[Tiger] WebSocket error\x1b[0m\r\n"); };
    }

    async function init() {
      const { Terminal } = await import("xterm");
      const { FitAddon } = await import("xterm-addon-fit");

      // Strict Mode cleanup may have fired during the async import above
      if (!alive || !containerRef.current) return;

      terminal = new Terminal({
        theme: THEMES[phosphor],
        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorInactiveStyle: "none",
        scrollback: 10000,
        scrollSensitivity: 3,
      });

      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      terminalRef.current = terminal;

      // Register input/resize handlers once — avoids duplicate sends on reconnect
      terminal.onData((data: string) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(data);
      });
      terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols, rows }));
      });

      // Track whether user has scrolled up so we can show the ↓ button
      // onScroll fires {position, source} in xterm 5.x
      terminal.onScroll((e: { position: number; source: number }) => {
        const t = terminalRef.current;
        if (!t) return;
        const viewportY = e.position;
        const atBottom = viewportY >= t.buffer.active.length - t.rows - 1;
        setIsScrolledUp(!atBottom);
      });

      const safeFit = () => {
        if (containerRef.current && containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
          fitAddon.fit();
        }
      };

      safeFit();
      if (isActive) terminal.focus();

      resizeObserver = new ResizeObserver(() => { if (alive) safeFit(); });
      resizeObserver.observe(containerRef.current);

      // Refresh canvas when the browser tab/window regains visibility.
      // Store in a ref so the outer cleanup can remove the correct listener.
      visibilityHandlerRef.current = () => {
        if (document.visibilityState === "visible" && alive) {
          requestAnimationFrame(() => {
            safeFit();
            terminal.refresh(0, terminal.rows - 1);
          });
          // Reconnect if the WebSocket dropped while the tab was inactive.
          if (!sawExit && (!ws || ws.readyState === WebSocket.CLOSED)) {
            reconnectAttempts = 0;
            connectWs();
          }
        }
      };
      document.addEventListener("visibilitychange", visibilityHandlerRef.current);

      connectWs();
    }

    init();

    return () => {
      alive = false;
      hasReceivedScrollbackRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (visibilityHandlerRef.current) {
        document.removeEventListener("visibilitychange", visibilityHandlerRef.current);
        visibilityHandlerRef.current = null;
      }
      resizeObserver?.disconnect();
      ws?.close();
      terminal?.dispose();
      fitAddonRef.current = null;
      terminalRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  // Update xterm theme if phosphor prop changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = THEMES[phosphor];
    }
  }, [phosphor]);

  // Focus/blur and repaint when active state changes
  useEffect(() => {
    const fit = fitAddonRef.current;
    const term = terminalRef.current;
    if (!term) return;
    if (isActive) {
      // Defer to next frame so the browser has time to apply display:flex and
      // compute layout — offsetWidth/Height are 0 until the frame after display changes.
      requestAnimationFrame(() => {
        if (fit && containerRef.current &&
            containerRef.current.offsetWidth > 0 &&
            containerRef.current.offsetHeight > 0) {
          fit.fit();
        }
        term.refresh(0, term.rows - 1);
        term.focus();
        term.scrollToBottom();
      });
    } else {
      term.blur();
    }
  }, [isActive]);

  return (
    <div
      className={`crt-screen crt-${phosphor}`}
      style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}
      onWheel={(e) => {
        if (showTranscript) return;
        if (!e.shiftKey) return;
        e.preventDefault();
        const term = terminalRef.current;
        if (!term) return;
        term.scrollLines(e.deltaY > 0 ? 3 : -3);
      }}
    >
      {/* xterm mounts here */}
      <div
        ref={containerRef}
        onClick={() => terminalRef.current?.focus()}
        style={{ width: "100%", height: "100%", padding: "8px", boxSizing: "border-box", cursor: "text", caretColor: "transparent", pointerEvents: showTranscript ? "none" : "auto" }}
      />

      {/* History overlay — reads xterm's rendered buffer, which has already processed all escape codes */}
      {showTranscript && (
        <div
          style={{
          position: "absolute", inset: 0, zIndex: 20,
          background: phosphor === "amber" ? "#0d0800" : "#050e05",
          overflowY: "scroll", padding: "12px 16px",
          fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
          fontSize: 12, lineHeight: 1.6,
          color: phosphor === "amber" ? "#ffb000" : "#33ff33",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          <div style={{ marginBottom: 12, opacity: 0.4, fontSize: 11, borderBottom: "1px solid currentColor", paddingBottom: 6 }}>
            ── session buffer ({terminalRef.current?.buffer.active.length ?? 0} lines) ──
          </div>
          {transcriptText}
          <div ref={transcriptEndRef} />
        </div>
      )}

      {/* Scroll-to-bottom button — only visible when scrolled up in live terminal */}
      {isScrolledUp && !showTranscript && (
        <button
          onClick={() => { terminalRef.current?.scrollToBottom(); terminalRef.current?.focus(); }}
          style={{
            position: "absolute", bottom: 12, right: 16,
            background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 6, color: phosphor === "amber" ? "#ffb347" : "#33ff33",
            fontSize: 12, padding: "4px 10px", cursor: "pointer",
            fontFamily: "var(--font-mono)", zIndex: 12,
            backdropFilter: "blur(4px)",
          }}
        >
          ↓ scroll to bottom
        </button>
      )}
      {/* CRT effects — pointer-events: none so they don't intercept input */}
      <div className="crt-scanlines" />
      <div className="crt-vignette" />
    </div>
  );
}
