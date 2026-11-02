"use client";

import { CommandPalette } from "@/components/command-palette";
import { DockRoot } from "@/components/dock-root";
import { MenuBar } from "@/components/menu-bar";
import { SideBar } from "@/components/side-bar";
import { StatusBar } from "@/components/status-bar";

export default function HomePage() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-vscode-bg text-vscode-text">
      <div className="flex h-full flex-col">
        <MenuBar />
        <div className="flex min-h-0 flex-1">
          <SideBar />
          <DockRoot />
        </div>
        <StatusBar />
      </div>
      <CommandPalette />
    </main>
  );
}
