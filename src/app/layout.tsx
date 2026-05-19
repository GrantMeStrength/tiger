import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tiger",
  description: "AI agent session manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply stored theme before first paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('tiger-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;})();` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
