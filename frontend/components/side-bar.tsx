"use client";

import { DndContext, DragOverlay, useDraggable } from "@dnd-kit/core";
import { useMemo, useState } from "react";

type ToolItem = {
  id: string;
  icon: string;
  label: string;
};

const tools: ToolItem[] = [
  { id: "select", icon: "arrow_selector_tool", label: "Select" },
  { id: "move", icon: "open_with", label: "Move" },
  { id: "brush", icon: "brush", label: "Brush" },
  { id: "palette", icon: "palette", label: "Palette" },
  { id: "play", icon: "play_arrow", label: "Preview" }
];

function DraggableTool({ tool }: { tool: ToolItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: tool.id,
      data: { tool }
    });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex h-10 w-10 items-center justify-center rounded text-vscode-text hover:bg-[#2d2d30]"
      title={tool.label}
    >
      <span
        className={`material-symbols-rounded ${isDragging ? "opacity-40" : ""}`}
      >
        {tool.icon}
      </span>
    </button>
  );
}

export function SideBar() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTool = useMemo(
    () => tools.find((tool) => tool.id === activeId) ?? null,
    [activeId]
  );

  return (
    <aside className="w-12 border-r border-vscode-border bg-vscode-panel">
      <DndContext
        onDragStart={(event) => setActiveId(String(event.active.id))}
        onDragEnd={() => setActiveId(null)}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex flex-col items-center py-2">
          {tools.map((tool) => (
            <DraggableTool key={tool.id} tool={tool} />
          ))}
        </div>
        <DragOverlay>
          {activeTool ? (
            <div className="flex h-10 w-10 items-center justify-center rounded border border-vscode-accent bg-[#2d2d30]">
              <span className="material-symbols-rounded">{activeTool.icon}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </aside>
  );
}
