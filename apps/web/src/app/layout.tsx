import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Task Router",
  description: "Local dashboard for parallel Claude CLI tasks with a single Codex review pass.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-[#232c38] bg-[#0e131a]">
            <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
              <Link href="/" className="font-semibold tracking-tight text-white">
                AI Task Router
              </Link>
              <nav className="flex items-center gap-4 text-sm text-[#8291a3]">
                <Link href="/" className="hover:text-white">
                  Tasks
                </Link>
                <Link
                  href="/tasks/new"
                  className="rounded-md bg-white/10 px-3 py-1.5 text-white hover:bg-white/20"
                >
                  + New Task
                </Link>
              </nav>
            </div>
          </header>
          <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
