"use client";

import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildSpriteSheet,
  generateWithDiffusers,
  healthCheck,
  listControlNetModels,
  listLocalModels,
  processGeneratedSprite,
  readImageDataUrl
} from "@/lib/tauri";
import { generationPresets } from "@/lib/generation-presets";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";

const sortOrders = [
  { value: "nameAsc", label: "Name Asc" },
  { value: "nameDesc", label: "Name Desc" },
  { value: "modifiedAsc", label: "Modified Asc" },
  { value: "modifiedDesc", label: "Modified Desc" }
] as const;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error object";
    }
  }
  return "Unknown error";
}

function deriveSpriteOutputPath(sourcePng: string): string {
  const normalized = sourcePng.replace(/\\/g, "/");
  const slashIndex = normalized.lastIndexOf("/");
  const directory = slashIndex >= 0 ? normalized.slice(0, slashIndex + 1) : "";
  const fileName = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
  const baseName = fileName.replace(/\.[^./]+$/, "");
  return `${directory}${baseName}_sprite_64.png`;
}

export function GeneratePanel() {
  const [busy, setBusy] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [controlNetOptions, setControlNetOptions] = useState<string[]>([]);
  const [posePreviewUrl, setPosePreviewUrl] = useState<string | null>(null);
  const [presetSelection, setPresetSelection] = useState<string>("sdxl-base");

  const prompt = useAppStore((state) => state.prompt);
  const generationPreset = useAppStore((state) => state.generationPreset);
  const negativePrompt = useAppStore((state) => state.negativePrompt);
  const checkpointFile = useAppStore((state) => state.checkpointFile);
  const vaeFile = useAppStore((state) => state.vaeFile);
  const poseImage = useAppStore((state) => state.poseImage);
  const controlNetFile = useAppStore((state) => state.controlNetFile);
  const poseStrength = useAppStore((state) => state.poseStrength);
  const outputPng = useAppStore((state) => state.outputPng);
  const width = useAppStore((state) => state.width);
  const height = useAppStore((state) => state.height);
  const steps = useAppStore((state) => state.steps);
  const guidanceScale = useAppStore((state) => state.guidanceScale);
  const seed = useAppStore((state) => state.seed);

  const spriteInputDir = useAppStore((state) => state.spriteInputDir);
  const spriteOutputPng = useAppStore((state) => state.spriteOutputPng);
  const downscaleMode = useAppStore((state) => state.downscaleMode);
  const spriteColumns = useAppStore((state) => state.spriteColumns);
  const spritePadding = useAppStore((state) => state.spritePadding);
  const spriteSortOrder = useAppStore((state) => state.spriteSortOrder);
  const metadataOutputJson = useAppStore((state) => state.metadataOutputJson);
  const status = useAppStore((state) => state.status);

  const setPrompt = useAppStore((state) => state.setPrompt);
  const setGenerationPreset = useAppStore((state) => state.setGenerationPreset);
  const applyGenerationPreset = useAppStore((state) => state.applyGenerationPreset);
  const setNegativePrompt = useAppStore((state) => state.setNegativePrompt);
  const setCheckpointFile = useAppStore((state) => state.setCheckpointFile);
  const setVaeFile = useAppStore((state) => state.setVaeFile);
  const setPoseImage = useAppStore((state) => state.setPoseImage);
  const setControlNetFile = useAppStore((state) => state.setControlNetFile);
  const setPoseStrength = useAppStore((state) => state.setPoseStrength);
  const setOutputPng = useAppStore((state) => state.setOutputPng);
  const setWidth = useAppStore((state) => state.setWidth);
  const setHeight = useAppStore((state) => state.setHeight);
  const setSteps = useAppStore((state) => state.setSteps);
  const setGuidanceScale = useAppStore((state) => state.setGuidanceScale);
  const setSeed = useAppStore((state) => state.setSeed);
  const setSpriteInputDir = useAppStore((state) => state.setSpriteInputDir);
  const setSpriteOutputPng = useAppStore((state) => state.setSpriteOutputPng);
  const setDownscaleMode = useAppStore((state) => state.setDownscaleMode);
  const setSpriteColumns = useAppStore((state) => state.setSpriteColumns);
  const setSpritePadding = useAppStore((state) => state.setSpritePadding);
  const setSpriteSortOrder = useAppStore((state) => state.setSpriteSortOrder);
  const setMetadataOutputJson = useAppStore((state) => state.setMetadataOutputJson);
  const setStatus = useAppStore((state) => state.setStatus);

  const builtInPresetByCheckpoint = useMemo(() => {
    const pairs: Array<[string, string]> = generationPresets.map((preset) => [
      preset.checkpointFile,
      preset.id
    ]);
    return new Map<string, string>(pairs);
  }, []);

  const dynamicPresetOptions = useMemo(
    () =>
      modelOptions
        .filter((model) => !builtInPresetByCheckpoint.has(model))
        .map((model) => ({
          id: `model:${model}`,
          label: `Auto (${model})`,
          checkpointFile: model
        })),
    [builtInPresetByCheckpoint, modelOptions]
  );

  const controlNetChoices = useMemo(
    () => [...new Set([...(controlNetOptions || []), controlNetFile].filter(Boolean))],
    [controlNetFile, controlNetOptions]
  );

  const refreshModels = useCallback(async () => {
    try {
      const models = await listLocalModels();
      setModelOptions(models);
      setStatus(`Detected ${models.length} checkpoint models`);
    } catch (error) {
      setStatus(`Model scan failed: ${getErrorMessage(error)}`);
    }
  }, [setStatus]);

  const refreshControlNetModels = useCallback(async () => {
    try {
      const models = await listControlNetModels();
      setControlNetOptions(models);
      if (models.length > 0 && !controlNetFile.trim()) {
        setControlNetFile(models[0]);
      }
    } catch (error) {
      setStatus(`ControlNet scan failed: ${getErrorMessage(error)}`);
    }
  }, [controlNetFile, setControlNetFile, setStatus]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  useEffect(() => {
    void refreshControlNetModels();
  }, [refreshControlNetModels]);

  useEffect(() => {
    if (!poseImage.trim()) {
      setPosePreviewUrl(null);
      return;
    }

    let active = true;
    void (async () => {
      try {
        const url = await readImageDataUrl(poseImage);
        if (active) {
          setPosePreviewUrl(url);
        }
      } catch {
        if (active) {
          setPosePreviewUrl(null);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [poseImage]);

  useEffect(() => {
    if (builtInPresetByCheckpoint.has(checkpointFile)) {
      setPresetSelection(builtInPresetByCheckpoint.get(checkpointFile) ?? generationPreset);
      return;
    }
    setPresetSelection(`model:${checkpointFile}`);
  }, [builtInPresetByCheckpoint, checkpointFile, generationPreset]);

  const onApplyPreset = () => {
    if (presetSelection.startsWith("model:")) {
      const model = presetSelection.slice("model:".length);
      setCheckpointFile(model);
      setStatus(`Applied auto preset for ${model}`);
      return;
    }
    applyGenerationPreset();
    setStatus("Applied generation preset");
  };

  const onSelectPoseImage = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Image files",
            extensions: ["png", "jpg", "jpeg", "webp"]
          }
        ]
      });
      if (typeof selected === "string") {
        setPoseImage(selected);
      }
    } catch (error) {
      setStatus(`Pose image selection failed: ${getErrorMessage(error)}`);
    }
  };

  const onGenerate = async () => {
    setBusy(true);
    setStatus(`Generating PNG to ${outputPng} ...`);
    try {
      const result = await generateWithDiffusers({
        prompt,
        negativePrompt,
        checkpointFile,
        vaeFile: vaeFile.trim() ? vaeFile : undefined,
        poseImage: poseImage.trim() ? poseImage : undefined,
        controlNetFile: controlNetFile.trim() ? controlNetFile : undefined,
        poseStrength: poseImage.trim() ? poseStrength : undefined,
        outputPng,
        width,
        height,
        steps,
        guidanceScale,
        seed: seed.trim() ? Number(seed) : undefined
      });
      const processedTarget = deriveSpriteOutputPath(result.outputPng);
      const intermediateDir = result.outputPng.replace(/\.[^./]+$/i, "_birefnet_stages");
      setStatus(
        `Generated ${result.outputPng}; running BiRefNet NN reduction to ${processedTarget} ...`
      );
      const postProcess = await processGeneratedSprite({
        inputPng: result.outputPng,
        outputPng: processedTarget,
        pixelSize: 64,
        downscaleMode,
        saveIntermediateStages: true,
        intermediateDir
      });
      setStatus(
        `Generated ${result.outputPng}; BiRefNet sprite output: ${postProcess.outputPng} (64x64, NN stages: ${postProcess.intermediateDir ?? "n/a"})`
      );
    } catch (error) {
      setStatus(`Generate failed: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const onProcessGeneratedSprite = async () => {
    setBusy(true);
    const spriteTarget = deriveSpriteOutputPath(outputPng);
    const intermediateDir = outputPng.replace(/\.[^./]+$/i, "_birefnet_stages");
    setStatus(`BiRefNet background removal: ${outputPng} -> ${spriteTarget} ...`);
    try {
      const result = await processGeneratedSprite({
        inputPng: outputPng,
        outputPng: spriteTarget,
        pixelSize: 64,
        downscaleMode,
        saveIntermediateStages: true,
        intermediateDir
      });
      setStatus(
        `BiRefNet processed: ${result.outputPng} (64x64 sprite; stages: ${result.intermediateDir ?? "n/a"})`
      );
    } catch (error) {
      setStatus(`BiRefNet processing failed: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const onBuildSheet = async () => {
    setBusy(true);
    try {
      const output = await buildSpriteSheet({
        inputDir: spriteInputDir,
        outputPng: spriteOutputPng,
        columns: spriteColumns,
        padding: spritePadding,
        sortOrder: spriteSortOrder,
        metadataOutputJson
      });
      setStatus(`Sprite sheet exported: ${output}`);
    } catch (error) {
      setStatus(`Sprite export failed: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const onHealthCheck = async () => {
    setBusy(true);
    try {
      const result = await healthCheck();
      setStatus(result);
    } catch (error) {
      setStatus(`Health check failed: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto bg-vscode-panel p-3">
      <h3 className="text-sm font-semibold">Diffusers Image Generation</h3>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className="text-xs text-vscode-muted">Generation Preset</label>
          <select
            value={presetSelection}
            onChange={(event) => {
              const selected = event.target.value;
              setPresetSelection(selected);
              if (!selected.startsWith("model:")) {
                setGenerationPreset(selected as typeof generationPreset);
              }
            }}
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          >
            {generationPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
            {dynamicPresetOptions.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
        <div className="self-end">
          <Button disabled={busy} onClick={onApplyPreset} variant="secondary">
            Apply Preset
          </Button>
        </div>
      </div>
      <label className="text-xs text-vscode-muted">Prompt</label>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        className="min-h-24 rounded border border-vscode-border bg-[#1f1f1f] p-2 text-xs text-vscode-text outline-none focus:border-vscode-accent"
      />
      <label className="text-xs text-vscode-muted">Negative Prompt</label>
      <textarea
        value={negativePrompt}
        onChange={(event) => setNegativePrompt(event.target.value)}
        className="min-h-16 rounded border border-vscode-border bg-[#1f1f1f] p-2 text-xs text-vscode-text outline-none focus:border-vscode-accent"
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-vscode-muted">Checkpoint Model</label>
          <select
            value={checkpointFile}
            onChange={(event) => setCheckpointFile(event.target.value)}
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          >
            {modelOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {!modelOptions.length ? <option value={checkpointFile}>{checkpointFile}</option> : null}
          </select>
        </div>
        <div>
          <label className="text-xs text-vscode-muted">VAE File (optional)</label>
          <input
            value={vaeFile}
            onChange={(event) => setVaeFile(event.target.value)}
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-vscode-muted">Width</label>
          <input
            type="number"
            min={64}
            step={64}
            value={width}
            onChange={(event) => setWidth(Math.max(64, Number(event.target.value || 64)))}
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          />
        </div>
        <div>
          <label className="text-xs text-vscode-muted">Height</label>
          <input
            type="number"
            min={64}
            step={64}
            value={height}
            onChange={(event) => setHeight(Math.max(64, Number(event.target.value || 64)))}
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          />
        </div>
        <div>
          <label className="text-xs text-vscode-muted">Steps</label>
          <input
            type="number"
            min={1}
            value={steps}
            onChange={(event) => setSteps(Math.max(1, Number(event.target.value || 1)))}
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-vscode-muted">Guidance Scale</label>
          <input
            type="number"
            min={1}
            step={0.5}
            value={guidanceScale}
            onChange={(event) =>
              setGuidanceScale(Math.max(1, Number(event.target.value || 1)))
            }
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          />
        </div>
        <div>
          <label className="text-xs text-vscode-muted">Seed (optional)</label>
          <input
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className="text-xs text-vscode-muted">DWPose / Pose Image (optional)</label>
          <input
            value={poseImage}
            onChange={(event) => setPoseImage(event.target.value)}
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          />
        </div>
        <div className="self-end">
          <Button disabled={busy} onClick={onSelectPoseImage} variant="secondary">
            Browse
          </Button>
        </div>
      </div>
      {posePreviewUrl ? (
        <div className="rounded border border-vscode-border bg-[#1a1a1a] p-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-vscode-muted">
            Pose preview
          </div>
          <img
            src={posePreviewUrl}
            alt="DWPose reference pose"
            className="max-h-32 w-full rounded object-contain"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-vscode-muted">Motion Strength</label>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={poseStrength}
            onChange={(event) => setPoseStrength(Math.max(0, Number(event.target.value || 0)))}
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          />
        </div>
        <div>
          <label className="text-xs text-vscode-muted">ControlNet Model</label>
          <select
            value={controlNetFile}
            onChange={(event) => setControlNetFile(event.target.value)}
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          >
            {controlNetChoices.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="text-xs text-vscode-muted">Generated PNG Path</label>
      <input
        value={outputPng}
        onChange={(event) => setOutputPng(event.target.value)}
        className="h-8 rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
      />

      <div>
        <label className="text-xs text-vscode-muted">
          Downscale Method (default: 1024→256 Lanczos, 256→128 Lanczos, 128→64 Nearest; recommended for pixel-art)
        </label>
        <select
          value={downscaleMode}
          onChange={(event) =>
            setDownscaleMode(
              event.target.value as "area" | "lanczos" | "nearestNeighbor"
            )
          }
          className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
        >
          <option value="area">Area</option>
          <option value="lanczos">Lanczos</option>
          <option value="nearestNeighbor">Nearest Neighbor</option>
        </select>
      </div>

      <h4 className="pt-1 text-sm font-semibold">Sprite Sheet Builder</h4>
      <label className="text-xs text-vscode-muted">Input Directory</label>
      <input
        value={spriteInputDir}
        onChange={(event) => setSpriteInputDir(event.target.value)}
        className="h-8 rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
      />

      <label className="text-xs text-vscode-muted">Output PNG</label>
      <input
        value={spriteOutputPng}
        onChange={(event) => setSpriteOutputPng(event.target.value)}
        className="h-8 rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
      />

      <label className="text-xs text-vscode-muted">Metadata JSON</label>
      <input
        value={metadataOutputJson}
        onChange={(event) => setMetadataOutputJson(event.target.value)}
        className="h-8 rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
      />

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-vscode-muted">Columns</label>
          <input
            type="number"
            min={1}
            value={spriteColumns}
            onChange={(event) =>
              setSpriteColumns(Math.max(1, Number(event.target.value || 1)))
            }
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          />
        </div>
        <div>
          <label className="text-xs text-vscode-muted">Padding(px)</label>
          <input
            type="number"
            min={0}
            value={spritePadding}
            onChange={(event) =>
              setSpritePadding(Math.max(0, Number(event.target.value || 0)))
            }
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          />
        </div>
        <div>
          <label className="text-xs text-vscode-muted">Sort</label>
          <select
            value={spriteSortOrder}
            onChange={(event) =>
              setSpriteSortOrder(
                event.target.value as
                  | "nameAsc"
                  | "nameDesc"
                  | "modifiedAsc"
                  | "modifiedDesc"
              )
            }
            className="h-8 w-full rounded border border-vscode-border bg-[#1f1f1f] px-2 text-sm text-vscode-text outline-none focus:border-vscode-accent"
          >
            {sortOrders.map((order) => (
              <option key={order.value} value={order.value}>
                {order.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={refreshModels} variant="secondary">
          Refresh Models
        </Button>
        <Button disabled={busy} onClick={onHealthCheck} variant="secondary">
          Check Rust Bridge
        </Button>
        <Button disabled={busy} onClick={onGenerate}>
          Generate (Diffusers)
        </Button>
        <Button disabled={busy} onClick={onProcessGeneratedSprite} variant="secondary">
          BiRefNet 64x64 (NN)
        </Button>
        <Button disabled={busy} onClick={onBuildSheet} variant="secondary">
          Build Sprite Sheet
        </Button>
      </div>
      <div className="rounded border border-vscode-border bg-[#1f1f1f] p-2 text-xs text-vscode-text">
        Status: {status}
      </div>
    </div>
  );
}
