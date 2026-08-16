import type { Metadata } from "next";
import "./globals.css";
import { pretendard } from "@/lib/fonts";
import { AppHeader } from "@/components/app-header";
import { ToastProvider } from "@/components/toast";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "AI Task Router",
  description: "Claude와 Codex에게 개발 작업을 맡기고 진행 상황을 관리하는 로컬 워크스페이스.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning`: the inline script below writes `data-theme`
    // onto this element before React ever runs, so the client tree
    // legitimately differs from the server's on that one attribute.
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <head>
        {/* Must execute before first paint — see lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/*
        `max-w-content` (see tailwind.config.ts) is the one shared outer
        width for the header and every main page — wide enough for
        deliberate multi-column layout on desktop (Home/Settings/Task
        Detail all use it directly), while still collapsing to full-width
        with a comfortable gutter on small screens. A page that also wants
        a narrower reading column for long text (Task Detail's instruction
        body, logs) nests that inside this width instead of using a
        different root width of its own.
      */}
      <body className="bg-bg text-fg">
        <ToastProvider>
          <div className="flex min-h-screen flex-col">
            <AppHeader />
            <main className="mx-auto w-full max-w-content flex-1 px-4 py-8 sm:px-6">
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
