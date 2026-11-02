"use client";

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import { useAppStore } from "@/store/app-store";

export function PreviewPanel() {
  const mountRef = useRef<HTMLDivElement>(null);
  const selectedColor = useAppStore((state) => state.selectedColor);

  useEffect(() => {
    let app: Application | undefined;
    const root = mountRef.current;

    const start = async () => {
      if (!root) return;
      app = new Application();
      await app.init({
        width: root.clientWidth || 600,
        height: root.clientHeight || 400,
        antialias: true,
        background: "#1f1f1f"
      });
      root.appendChild(app.canvas);

      const stage = new Container();
      app.stage.addChild(stage);

      const spriteFrame = new Graphics()
        .roundRect(30, 30, 220, 220, 8)
        .fill({ color: selectedColor });
      stage.addChild(spriteFrame);

      const text = new Text({
        text: "PixiJS Preview",
        style: {
          fill: 0xffffff,
          fontSize: 18
        }
      });
      text.position.set(30, 265);
      stage.addChild(text);
    };

    void start();
    return () => {
      app?.destroy(true, { children: true });
    };
  }, [selectedColor]);

  return <div ref={mountRef} className="h-full w-full bg-vscode-panel" />;
}
