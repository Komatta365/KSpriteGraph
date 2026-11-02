"use client";

import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";

const commands = [
  { id: "gen", title: "Generate Image", status: "Generating image..." },
  { id: "sheet", title: "Build Sprite Sheet", status: "Building sprite sheet..." },
  { id: "connect", title: "Check Diffusers Backend", status: "Checking backend..." }
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const setStatus = useAppStore((state) => state.setStatus);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-20">
      <Command className="w-[560px] overflow-hidden rounded border border-vscode-border bg-vscode-panel shadow-lg">
        <Command.Input
          autoFocus
          className="h-11 w-full border-0 border-b border-vscode-border bg-[#1f1f1f] px-3 text-sm text-vscode-text outline-none"
          placeholder="Type a command or search..."
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <Command.List className="max-h-[360px] overflow-auto p-1">
          <Command.Empty className="p-2 text-xs text-vscode-muted">
            No result.
          </Command.Empty>
          <Command.Group heading="Commands" className="text-xs text-vscode-muted">
            {commands.map((item) => (
              <Command.Item
                key={item.id}
                onSelect={() => {
                  setStatus(item.status);
                  setOpen(false);
                }}
                className="cursor-pointer rounded px-2 py-2 text-sm text-vscode-text aria-selected:bg-[#2a2d2e]"
              >
                {item.title}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
