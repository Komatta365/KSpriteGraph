import { invoke } from "@tauri-apps/api/core";

export type DiffusersGenerateRequest = {
  prompt: string;
  negativePrompt?: string;
  checkpointFile: string;
  vaeFile?: string;
  poseImage?: string;
  controlNetFile?: string;
  poseStrength?: number;
  outputPng: string;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  seed?: number;
};

export type DiffusersGenerateResult = {
  outputPng: string;
  metadataJson: string;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  seed: number;
  checkpointFile: string;
  vaeFile?: string | null;
  poseImage?: string | null;
  controlNetFile?: string | null;
  poseStrength?: number | null;
};

export type BuildSpriteSheetRequest = {
  inputDir: string;
  outputPng: string;
  columns: number;
  padding: number;
  sortOrder: "nameAsc" | "nameDesc" | "modifiedAsc" | "modifiedDesc";
  metadataOutputJson?: string;
};

export type DownscaleMode = "area" | "lanczos" | "nearestNeighbor";

export type PostProcessSpriteRequest = {
  inputPng: string;
  outputPng: string;
  pixelSize: number;
  downscaleMode?: DownscaleMode;
  saveIntermediateStages?: boolean;
  intermediateDir?: string;
};

export type PostProcessSpriteResult = {
  inputPng: string;
  outputPng: string;
  pixelSize: number;
  removedBackground: boolean;
  downscaleMode?: DownscaleMode;
  saveIntermediateStages?: boolean;
  intermediateDir?: string;
};

export async function listLocalModels(): Promise<string[]> {
  return invoke<string[]>("list_local_models");
}

export async function listControlNetModels(): Promise<string[]> {
  return invoke<string[]>("list_controlnet_models");
}

export async function generateWithDiffusers(
  payload: DiffusersGenerateRequest
): Promise<DiffusersGenerateResult> {
  return invoke<DiffusersGenerateResult>("generate_with_diffusers", {
    request: payload
  });
}

export async function buildSpriteSheet(
  payload: BuildSpriteSheetRequest
): Promise<string> {
  return invoke<string>("build_sprite_sheet", { request: payload });
}

export async function processGeneratedSprite(
  payload: PostProcessSpriteRequest
): Promise<PostProcessSpriteResult> {
  return invoke<PostProcessSpriteResult>("process_generated_sprite", {
    request: payload
  });
}

export async function readImageDataUrl(path: string): Promise<string> {
  return invoke<string>("read_image_data_url", { path });
}

export async function healthCheck(): Promise<string> {
  return invoke<string>("health_check");
}
