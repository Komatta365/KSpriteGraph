"use client";

import dagre from "dagre";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";

const initialNodes = [
  { id: "editor", data: { label: "Visual Script Editor" }, position: { x: 0, y: 0 } },
  { id: "service", data: { label: "Python Image Service" }, position: { x: 0, y: 0 } },
  { id: "diffusers", data: { label: "Diffusers Pipeline" }, position: { x: 0, y: 0 } },
  { id: "sdxl", data: { label: "SDXL Model" }, position: { x: 0, y: 0 } },
  { id: "output", data: { label: "PNG / Sprite Sheet" }, position: { x: 0, y: 0 } }
];

const initialEdges = [
  { id: "e1", source: "editor", target: "service" },
  { id: "e2", source: "service", target: "diffusers" },
  { id: "e3", source: "diffusers", target: "sdxl" },
  { id: "e4", source: "sdxl", target: "output" }
];

function autoLayout(
  nodes: typeof initialNodes,
  edges: typeof initialEdges,
  direction: "LR" | "TB" = "LR"
) {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 80, nodesep: 45 });

  nodes.forEach((node) => g.setNode(node.id, { width: 220, height: 42 }));
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));

  dagre.layout(g);
  return nodes.map((node) => {
    const p = g.node(node.id);
    return { ...node, position: { x: p.x - 110, y: p.y - 21 } };
  });
}

function Graph() {
  const layouted = useMemo(() => autoLayout(initialNodes, initialEdges, "LR"), []);
  const [nodes, , onNodesChange] = useNodesState(layouted);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
      style={{ background: "#1e1e1e" }}
    >
      <MiniMap />
      <Controls />
      <Background gap={24} />
    </ReactFlow>
  );
}

export function NodeGraphPanel() {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <Graph />
      </ReactFlowProvider>
    </div>
  );
}
