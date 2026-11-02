import { invoke } from "@tauri-apps/api/core";

export type DiffusersGenerateRequest = {
  prompt: string;
  negativePrompt?: string;
  checkpointFile: string;
  vaeFile?: string;
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
};

export type BuildSpriteSheetRequest = {
  inputDir: string;
  outputPng: string;
  columns: number;
  padding: number;
  sortOrder: "nameAsc" | "nameDesc" | "modifiedAsc" | "modifiedDesc";
  metadataOutputJson?: string;
};

export async function listLocalModels(): Promise<string[]> {
  return invoke<string[]>("list_local_models");
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

export async function healthCheck(): Promise<string> {
  return invoke<string>("health_check");
}
