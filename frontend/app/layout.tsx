import type { Metadata } from "next";
import "./globals.css";
import "flexlayout-react/style/light.css";

export const metadata: Metadata = {
  title: "KSpriteGraph",
  description: "Node-based sprite generation tool with Tauri + ComfyUI"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
