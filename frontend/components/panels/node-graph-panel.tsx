"use client";

import dagre from "dagre";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readImageDataUrl } from "@/lib/tauri";

type GraphNodeData = {
  label: string;
  imagePath?: string;
  onOpenImage?: (src: string | null) => void;
};

const stageImagePaths = {
  generate: "outputs/generated.png",
  birefnet: "outputs/generated_sprite_64.png",
  stage1024: "outputs/generated_birefnet_stages/stage-1-1024x1024.png",
  stage512: "outputs/generated_birefnet_stages/stage-2-512x512.png",
  stage256: "outputs/generated_birefnet_stages/stage-3-256x256.png",
  stage128: "outputs/generated_birefnet_stages/stage-4-128x128.png",
  stage64: "outputs/generated_sprite_64.png",
  pixelart: "outputs/generated_sprite_64.png",
  output: "outputs/generated_sprite_64.png"
} as const;

const initialEdges: Edge[] = [
  { id: "e1", source: "generate", target: "birefnet", animated: true },
  { id: "e2", source: "birefnet", target: "stage1024", animated: true },
  { id: "e3", source: "stage1024", target: "stage512", animated: true },
  { id: "e4", source: "stage512", target: "stage256", animated: true },
  { id: "e5", source: "stage256", target: "stage128", animated: true },
  { id: "e6", source: "stage128", target: "stage64", animated: true },
  { id: "e7", source: "stage64", target: "pixelart", animated: true },
  { id: "e8", source: "pixelart", target: "output", animated: true }
];

function makeNodes(onOpenImage: (src: string | null) => void) {
  return [
    {
      id: "generate",
      type: "imageNode",
      data: { label: "Generate Image", imagePath: stageImagePaths.generate, onOpenImage },
      position: { x: 0, y: 0 },
      style: { width: 200, border: "1px solid #334155", borderRadius: 12 }
    },
    {
      id: "birefnet",
      type: "imageNode",
      data: { label: "BiRefNet", imagePath: stageImagePaths.birefnet, onOpenImage },
      position: { x: 0, y: 0 },
      style: { width: 200, border: "1px solid #334155", borderRadius: 12 }
    },
    {
      id: "pixelart",
      type: "imageNode",
      data: { label: "Nearest Neighbor 64x64", imagePath: stageImagePaths.pixelart, onOpenImage },
      position: { x: 0, y: 0 },
      style: { width: 210, border: "1px solid #334155", borderRadius: 12 }
    },
    {
      id: "output",
      type: "imageNode",
      data: { label: "Transparent Sprite Output", imagePath: stageImagePaths.output, onOpenImage },
      position: { x: 0, y: 0 },
      style: { width: 210, border: "1px solid #334155", borderRadius: 12 }
    },
    {
      id: "stage1024",
      type: "imageNode",
      data: { label: "1024", imagePath: stageImagePaths.stage1024, onOpenImage },
      position: { x: 0, y: 0 },
      style: { width: 140, border: "1px solid #334155", borderRadius: 12 }
    },
    {
      id: "stage512",
      type: "imageNode",
      data: { label: "512", imagePath: stageImagePaths.stage512, onOpenImage },
      position: { x: 0, y: 0 },
      style: { width: 140, border: "1px solid #334155", borderRadius: 12 }
    },
    {
      id: "stage256",
      type: "imageNode",
      data: { label: "256", imagePath: stageImagePaths.stage256, onOpenImage },
      position: { x: 0, y: 0 },
      style: { width: 140, border: "1px solid #334155", borderRadius: 12 }
    },
    {
      id: "stage128",
      type: "imageNode",
      data: { label: "128", imagePath: stageImagePaths.stage128, onOpenImage },
      position: { x: 0, y: 0 },
      style: { width: 140, border: "1px solid #334155", borderRadius: 12 }
    },
    {
      id: "stage64",
      type: "imageNode",
      data: { label: "64", imagePath: stageImagePaths.stage64, onOpenImage },
      position: { x: 0, y: 0 },
      style: { width: 140, border: "1px solid #334155", borderRadius: 12 }
    }
  ];
}

function autoLayout(nodes: any[], edges: Edge[], direction: "LR" | "TB" = "LR") {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 90, nodesep: 40 });

  nodes.forEach((node) => g.setNode(node.id, { width: 220, height: 98 }));
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));

  dagre.layout(g);
  return nodes.map((node) => {
    const p = g.node(node.id);
    return { ...node, position: { x: p.x - 110, y: p.y - 49 } };
  });
}

function ImagePreviewNode(props: any) {
  const { data } = props as { data: GraphNodeData };
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(data.imagePath));

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!data.imagePath) {
        setPreview(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const imageUrl = await readImageDataUrl(data.imagePath);
        if (isMounted) {
          setPreview(imageUrl);
        }
      } catch {
        if (isMounted) {
          setPreview(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [data.imagePath]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-slate-900 p-2 text-white shadow-lg">
      <Handle type="target" position={Position.Left} className="!bg-sky-400" />

      <button
        type="button"
        onClick={() => data.onOpenImage?.(preview ?? null)}
        disabled={!preview}
        className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-slate-600 bg-slate-800 disabled:cursor-default disabled:opacity-70"
      >
        {preview ? (
          <img src={preview} alt={data.label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[10px] font-medium text-slate-300">
            {loading ? "Loading..." : "No Image"}
          </span>
        )}
      </button>

      <div className="max-w-[170px] text-center text-[10px] font-medium leading-tight text-slate-200">
        {data.label}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-emerald-400" />
    </div>
  );
}

function Graph() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const onOpenImage = useCallback((src: string | null) => setSelectedImage(src), []);

  const layouted = useMemo(() => autoLayout(makeNodes(onOpenImage), initialEdges, "LR"), [onOpenImage]);
  const [nodes, , onNodesChange] = useNodesState(layouted);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{ imageNode: ImagePreviewNode }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        defaultEdgeOptions={{ animated: true, type: "smoothstep" }}
        style={{ background: "#1e1e1e" }}
      >
        <MiniMap />
        <Controls />
        <Background gap={24} />
      </ReactFlow>

      {selectedImage ? (
        <button
          type="button"
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <img
            src={selectedImage}
            alt="node preview"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg border border-slate-600 bg-slate-900 shadow-2xl"
          />
        </button>
      ) : null}
    </>
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
