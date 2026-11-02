import { create } from "zustand";
import {
  findPreset,
  type GenerationPresetId
} from "@/lib/generation-presets";

type AppState = {
  selectedColor: string;
  generationPreset: GenerationPresetId;
  prompt: string;
  negativePrompt: string;
  checkpointFile: string;
  vaeFile: string;
  outputPng: string;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  seed: string;
  spriteInputDir: string;
  spriteOutputPng: string;
  spriteColumns: number;
  spritePadding: number;
  spriteSortOrder: "nameAsc" | "nameDesc" | "modifiedAsc" | "modifiedDesc";
  metadataOutputJson: string;
  status: string;
  setSelectedColor: (color: string) => void;
  setGenerationPreset: (value: GenerationPresetId) => void;
  applyGenerationPreset: () => void;
  setPrompt: (value: string) => void;
  setNegativePrompt: (value: string) => void;
  setCheckpointFile: (value: string) => void;
  setVaeFile: (value: string) => void;
  setOutputPng: (value: string) => void;
  setWidth: (value: number) => void;
  setHeight: (value: number) => void;
  setSteps: (value: number) => void;
  setGuidanceScale: (value: number) => void;
  setSeed: (value: string) => void;
  setSpriteInputDir: (value: string) => void;
  setSpriteOutputPng: (value: string) => void;
  setSpriteColumns: (value: number) => void;
  setSpritePadding: (value: number) => void;
  setSpriteSortOrder: (
    value: "nameAsc" | "nameDesc" | "modifiedAsc" | "modifiedDesc"
  ) => void;
  setMetadataOutputJson: (value: string) => void;
  setStatus: (status: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  generationPreset: "sdxl-base",
  selectedColor: "#57a6ff",
  prompt: findPreset("sdxl-base").prompt,
  negativePrompt: findPreset("sdxl-base").negativePrompt,
  checkpointFile: findPreset("sdxl-base").checkpointFile,
  vaeFile: "sdxl_vae_fp16_fix.safetensors",
  outputPng: "outputs/generated.png",
  width: 1024,
  height: 1024,
  steps: findPreset("sdxl-base").steps,
  guidanceScale: findPreset("sdxl-base").guidanceScale,
  seed: "",
  spriteInputDir: "outputs/frames",
  spriteOutputPng: "outputs/sprite-sheet.png",
  spriteColumns: 8,
  spritePadding: 0,
  spriteSortOrder: "nameAsc",
  metadataOutputJson: "outputs/sprite-sheet.json",
  status: "Ready",
  setSelectedColor: (color) => set({ selectedColor: color }),
  setGenerationPreset: (value) => set({ generationPreset: value }),
  applyGenerationPreset: () =>
    set((state) => {
      const preset = findPreset(state.generationPreset);
      return {
        prompt: preset.prompt,
        negativePrompt: preset.negativePrompt,
        checkpointFile: preset.checkpointFile,
        steps: preset.steps,
        guidanceScale: preset.guidanceScale
      };
    }),
  setPrompt: (value) => set({ prompt: value }),
  setNegativePrompt: (value) => set({ negativePrompt: value }),
  setCheckpointFile: (value) => set({ checkpointFile: value }),
  setVaeFile: (value) => set({ vaeFile: value }),
  setOutputPng: (value) => set({ outputPng: value }),
  setWidth: (value) => set({ width: value }),
  setHeight: (value) => set({ height: value }),
  setSteps: (value) => set({ steps: value }),
  setGuidanceScale: (value) => set({ guidanceScale: value }),
  setSeed: (value) => set({ seed: value }),
  setSpriteInputDir: (value) => set({ spriteInputDir: value }),
  setSpriteOutputPng: (value) => set({ spriteOutputPng: value }),
  setSpriteColumns: (value) => set({ spriteColumns: value }),
  setSpritePadding: (value) => set({ spritePadding: value }),
  setSpriteSortOrder: (value) => set({ spriteSortOrder: value }),
  setMetadataOutputJson: (value) => set({ metadataOutputJson: value }),
  setStatus: (status) => set({ status })
}));
