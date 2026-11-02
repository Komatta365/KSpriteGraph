import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        vscode: {
          bg: "var(--vscode-bg)",
          panel: "var(--vscode-panel)",
          border: "var(--vscode-border)",
          text: "var(--vscode-text)",
          muted: "var(--vscode-muted)",
          accent: "var(--vscode-accent)"
        }
      }
    }
  },
  plugins: []
};

export default config;
