import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pact — Privacy-Preserving AI Agent Network",
  description: "Your personal AI agent negotiates with businesses while keeping your data private.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100 min-h-screen antialiased">
        <nav className="border-b border-neutral-800 px-6 py-3 flex items-center gap-4">
          <span className="font-bold text-lg tracking-tight text-green-400">pact</span>
          <span className="text-neutral-500 text-sm">privacy-preserving agent network</span>
          <div className="ml-auto flex gap-4">
            <a href="/" className="text-sm text-neutral-300 hover:text-white transition-colors">
              My Agent
            </a>
            <a href="/business" className="text-sm text-neutral-300 hover:text-white transition-colors">
              Business Onboarding
            </a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
