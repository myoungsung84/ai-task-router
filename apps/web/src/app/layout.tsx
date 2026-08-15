import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/components/app-header";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "AI Task Router",
  description: "Local dashboard for parallel Claude CLI tasks with a single Codex review pass.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <ToastProvider>
          <div className="min-h-screen flex flex-col">
            <AppHeader />
            <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
