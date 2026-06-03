"use client";

import { useEffect, useRef, useState } from "react";

let mermaidReady = false;

async function getMermaid() {
  const m = await import("mermaid");
  if (!mermaidReady) {
    m.default.initialize({
      startOnLoad: false,
      theme: "dark",
      themeVariables: {
        background: "#09090b",
        primaryColor: "#1a2a1a",
        primaryTextColor: "#39ff14",
        primaryBorderColor: "rgba(57,255,20,0.4)",
        lineColor: "rgba(57,255,20,0.6)",
        secondaryColor: "#0a1a0a",
        tertiaryColor: "#091409",
        edgeLabelBackground: "#09090b",
        fontFamily: "SF Mono, JetBrains Mono, Fira Code, monospace",
        fontSize: "13px",
      },
    });
    mermaidReady = true;
  }
  return m.default;
}

export function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    (async () => {
      try {
        const mermaid = await getMermaid();
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setRendered(true);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <pre style={{ color: "#ff6666", fontSize: 12, whiteSpace: "pre-wrap", margin: "4px 0" }}>
        {`⚠ mermaid parse error\n${code}`}
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        margin: "8px 0",
        padding: "16px",
        background: "rgba(57,255,20,0.03)",
        border: "1px solid rgba(57,255,20,0.15)",
        borderRadius: 6,
        overflow: "auto",
        minHeight: rendered ? undefined : 60,
      }}
    />
  );
}
