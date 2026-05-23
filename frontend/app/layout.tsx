import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import NavLinks from "../components/NavLinks";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pact — Privacy-Preserving Agent Network",
  description: "Personal AI agents negotiate with business agents while keeping your data private.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body
        style={{ fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)" }}
        className="min-h-screen"
      >
        <nav
          style={{
            height: "44px",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--bg)",
          }}
          className="flex items-center px-5 gap-6"
        >
          <a
            href="/"
            style={{ color: "var(--text)", fontFamily: "var(--font-mono, monospace)" }}
            className="text-sm font-medium flex items-center gap-1.5 select-none"
          >
            <span style={{ color: "var(--muted)" }}>◈</span> Pact
          </a>
          <div className="flex-1" />
          <NavLinks />
        </nav>
        {children}
      </body>
    </html>
  );
}
