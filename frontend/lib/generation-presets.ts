export type GenerationPresetId = "sdxl-base" | "dreamshaper-xl" | "juggernaut-xl";

export type GenerationPreset = {
  id: GenerationPresetId;
  label: string;
  checkpointFile: string;
  prompt: string;
  negativePrompt: string;
  steps: number;
  guidanceScale: number;
};

export const generationPresets: GenerationPreset[] = [
  {
    id: "sdxl-base",
    label: "SDXL Base 1.0",
    checkpointFile: "sd_xl_base_1.0.safetensors",
    prompt:
      "masterpiece, best quality, full body sprite character, transparent background, game asset style",
    negativePrompt: "low quality, blurry, jpeg artifacts, watermark, text",
    steps: 30,
    guidanceScale: 7
  },
  {
    id: "dreamshaper-xl",
    label: "DreamShaperXL",
    checkpointFile: "DreamShaperXL.safetensors",
    prompt:
      "masterpiece, detailed anime character sprite sheet, vibrant colors, clean lineart, transparent background",
    negativePrompt: "low quality, blurry, deformed, watermark, text",
    steps: 32,
    guidanceScale: 6.5
  },
  {
    id: "juggernaut-xl",
    label: "JuggernautXL",
    checkpointFile: "JuggernautXL.safetensors",
    prompt:
      "masterpiece, cinematic fantasy game sprite, high contrast lighting, transparent background",
    negativePrompt: "low quality, blurry, noisy, watermark, text",
    steps: 35,
    guidanceScale: 6
  }
];

export function findPreset(id: GenerationPresetId): GenerationPreset {
  return generationPresets.find((preset) => preset.id === id) ?? generationPresets[0];
}
