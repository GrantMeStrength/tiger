// No "use client" — this is dynamically imported only on the client
import { useEffect, useRef } from "react";
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

export default function TerminalAgentView({ agentId, isActive, phosphor = "green" }: { agentId: string; isActive: boolean; phosphor?: "green" | "amber" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terminalRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitAddonRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visibilityHandlerRef = useRef<any>(null);

  useEffect(() => {
    // `alive` must be checked after EVERY await — Strict Mode cleanup fires before async imports resolve,
    // so checking only at the top is not sufficient.
    let alive = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let terminal: any = null;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 8;

    function connectWs() {
      if (!alive) return;
      ws = new WebSocket(`ws://${window.location.host}/ws/terminal/${agentId}`);

      ws.onopen = () => {
        if (!alive) { ws?.close(); return; }
        reconnectAttempts = 0;
        terminal.write("\r\n\x1b[2;32m[Tiger] Terminal connected\x1b[0m\r\n\r\n");
        ws!.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
        if (isActive) terminal.focus();
      };

      ws.onmessage = (e) => { if (alive) terminal.write(e.data); };

      ws.onclose = () => {
        if (!alive) return;
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

      terminal.onData((data: string) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(data);
      });

      terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols, rows }));
      });
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
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      terminalRef.current = terminal;

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
        }
      };
      document.addEventListener("visibilitychange", visibilityHandlerRef.current);

      connectWs();
    }

    init();

    return () => {
      alive = false;
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

  // Focus/blur and repaint when active state changes
  useEffect(() => {
    const fit = fitAddonRef.current;
    const term = terminalRef.current;
    if (!term) return;
    if (isActive) {
      if (fit && containerRef.current && containerRef.current.offsetWidth > 0) fit.fit();
      requestAnimationFrame(() => {
        term.refresh(0, term.rows - 1);
        term.focus();
      });
    } else {
      term.blur();
    }
  }, [isActive]);

  return (
    <div className={`crt-screen crt-${phosphor}`} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      {/* xterm mounts here */}
      <div
        ref={containerRef}
        onClick={() => terminalRef.current?.focus()}
        style={{ width: "100%", height: "100%", padding: "8px", boxSizing: "border-box", cursor: "text", caretColor: "transparent" }}
      />
      {/* CRT effects — pointer-events: none so they don't intercept input */}
      <div className="crt-scanlines" />
      <div className="crt-vignette" />
    </div>
  );
}
