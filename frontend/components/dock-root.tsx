"use client";

import { Layout, Model, TabNode } from "flexlayout-react";
import { useMemo } from "react";
import { ColorPanel } from "@/components/panels/color-panel";
import { GeneratePanel } from "@/components/panels/generate-panel";
import { NodeGraphPanel } from "@/components/panels/node-graph-panel";
import { PreviewPanel } from "@/components/panels/preview-panel";

const initialModel = {
  global: {
    tabEnableRename: false
  },
  layout: {
    type: "row",
    children: [
      {
        type: "tabset",
        weight: 70,
        children: [
          { type: "tab", name: "Node Graph", component: "nodeGraph" },
          { type: "tab", name: "Preview", component: "preview" }
        ]
      },
      {
        type: "tabset",
        weight: 30,
        children: [
          { type: "tab", name: "Generate", component: "generate" },
          { type: "tab", name: "Color", component: "color" }
        ]
      }
    ]
  }
};

export function DockRoot() {
  const model = useMemo(() => Model.fromJson(initialModel), []);

  const factory = (node: TabNode) => {
    const component = node.getComponent();
    switch (component) {
      case "nodeGraph":
        return <NodeGraphPanel />;
      case "preview":
        return <PreviewPanel />;
      case "generate":
        return <GeneratePanel />;
      case "color":
        return <ColorPanel />;
      default:
        return <div>Unknown panel</div>;
    }
  };

  return (
    <section className="min-w-0 flex-1 overflow-hidden bg-vscode-bg">
      <Layout model={model} factory={factory} />
    </section>
  );
}
