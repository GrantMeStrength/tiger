// No "use client" — this is dynamically imported only on the client
import { useEffect, useRef } from "react";
import "xterm/css/xterm.css";

export default function TerminalAgentView({ agentId }: { agentId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terminalRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let terminal: any;
    let ws: WebSocket | null = null;
    let disposed = false;

    async function init() {
      const { Terminal } = await import("xterm");
      const { FitAddon } = await import("xterm-addon-fit");

      terminal = new Terminal({
        theme: {
          background: "#0d1117",
          foreground: "#c9d1d9",
          cursor: "#f97316",
          selectionBackground: "#f9731630",
          black: "#484f58",
          red: "#f85149",
          green: "#3fb950",
          yellow: "#d29922",
          blue: "#58a6ff",
          magenta: "#bc8cff",
          cyan: "#39c5cf",
          white: "#b1bac4",
          brightBlack: "#6e7681",
          brightRed: "#ff7b72",
          brightGreen: "#56d364",
          brightYellow: "#e3b341",
          brightBlue: "#79c0ff",
          brightMagenta: "#d2a8ff",
          brightCyan: "#56d4dd",
          brightWhite: "#f0f6fc",
        },
        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        scrollback: 5000,
        allowTransparency: true,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current!);
      fitAddon.fit();
      terminal.focus();
      terminalRef.current = terminal;

      // Observe container resize
      const resizeObserver = new ResizeObserver(() => {
        if (!disposed) fitAddon.fit();
      });
      resizeObserver.observe(containerRef.current!);

      // Connect WebSocket
      const wsUrl = `ws://${window.location.host}/ws/terminal/${agentId}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        terminal.write("\r\n\x1b[2;32m[Tiger] Terminal connected\x1b[0m\r\n\r\n");
        ws!.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
        terminal.focus();
      };

      ws.onmessage = (e) => {
        terminal.write(e.data);
      };

      ws.onclose = () => {
        if (!disposed) terminal.write("\r\n\x1b[2;33m[Tiger] Connection closed\x1b[0m\r\n");
      };

      ws.onerror = () => {
        terminal.write("\r\n\x1b[2;31m[Tiger] WebSocket error\x1b[0m\r\n");
      };

      terminal.onData((data: string) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(data);
      });

      terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      });

      return () => {
        resizeObserver.disconnect();
      };
    }

    let cleanupResize: (() => void) | undefined;
    init().then((cleanup) => { cleanupResize = cleanup; });

    return () => {
      disposed = true;
      cleanupResize?.();
      ws?.close();
      terminal?.dispose();
    };
  }, [agentId]);

  return (
    <div
      ref={containerRef}
      onClick={() => terminalRef.current?.focus()}
      style={{
        width: "100%",
        height: "100%",
        padding: "8px",
        boxSizing: "border-box",
        cursor: "text",
      }}
    />
  );
}
