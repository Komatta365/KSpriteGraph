const items = ["File", "Edit", "View", "Node", "Generate", "Window", "Help"];

export function MenuBar() {
  return (
    <header className="flex h-9 items-center gap-1 border-b border-vscode-border bg-vscode-panel px-3 text-xs">
      <span className="mr-2 font-semibold">KSpriteGraph</span>
      {items.map((item) => (
        <button
          key={item}
          className="rounded px-2 py-1 text-vscode-text hover:bg-[#2d2d30]"
        >
          {item}
        </button>
      ))}
    </header>
  );
}
