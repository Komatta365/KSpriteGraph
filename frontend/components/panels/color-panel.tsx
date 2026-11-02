"use client";

import { Sketch } from "@uiw/react-color";
import { useAppStore } from "@/store/app-store";

export function ColorPanel() {
  const selectedColor = useAppStore((state) => state.selectedColor);
  const setSelectedColor = useAppStore((state) => state.setSelectedColor);

  return (
    <div className="h-full overflow-auto bg-vscode-panel p-3">
      <h3 className="mb-3 text-sm font-semibold">Color Picker</h3>
      <Sketch
        color={selectedColor}
        style={{ width: "100%", background: "#2d2d30", boxShadow: "none" }}
        onChange={(color) => setSelectedColor(color.hex)}
      />
    </div>
  );
}
