"use client";

import { useAppStore } from "@/store/app-store";

export function StatusBar() {
  const status = useAppStore((state) => state.status);
  return (
    <footer className="flex h-6 items-center justify-between bg-vscode-accent px-3 text-xs text-white">
      <span>{status}</span>
      <span>Diffusers + SDXL + Tauri</span>
    </footer>
  );
}
