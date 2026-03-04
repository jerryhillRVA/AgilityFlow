import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { AgentWorkspace } from "@/components/layout/AgentWorkspace";
import { ParallaxGrid } from "@/components/layout/ParallaxGrid";
import { WorkflowProvider } from "@/components/providers/WorkflowProvider";
import { getWorkflow } from "@/lib/agentic/workflow-loader";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agility Flow",
  description: "Markdown-driven agentic platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const workflowConfig = getWorkflow();

  return (
    <html lang="en" className="dark">
      <body className={`${geistMono.variable} antialiased bg-noise`}>
        <WorkflowProvider config={workflowConfig}>
          {/* Parallax grid renders at body level — behind everything */}
          <ParallaxGrid />

          <div className="flex h-screen overflow-hidden relative" style={{ zIndex: 1 }}>
            <Sidebar />
            <main className="flex-1 overflow-y-auto relative [transform:translateZ(0)]">
              <div className="relative p-6 animate-fade-in">
                {children}
              </div>
            </main>
            <AgentWorkspace />
          </div>
        </WorkflowProvider>
      </body>
    </html>
  );
}
