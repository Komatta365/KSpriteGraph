import argparse
import json
from pathlib import Path

import torch
from diffusers import AutoencoderKL, StableDiffusionXLPipeline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate image with Diffusers SDXL")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--negative", default="")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--vae", default="")
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--guidance", type=float, default=7.0)
    parser.add_argument("--seed", type=int)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(args.project_root).resolve()
    checkpoint_path = root / "models" / "checkpoints" / args.checkpoint
    if not checkpoint_path.exists():
        raise FileNotFoundError(f"checkpoint not found: {checkpoint_path}")

    vae_path = None
    if args.vae:
        vae_candidate = root / "models" / "vae" / args.vae
        if not vae_candidate.exists():
            raise FileNotFoundError(f"vae not found: {vae_candidate}")
        vae_path = vae_candidate

    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    pipe = StableDiffusionXLPipeline.from_single_file(
        checkpoint_path.as_posix(), torch_dtype=dtype, use_safetensors=True
    )
    if vae_path:
        vae = AutoencoderKL.from_single_file(vae_path.as_posix(), torch_dtype=dtype)
        pipe.vae = vae

    if torch.cuda.is_available():
        pipe = pipe.to("cuda")
    else:
        pipe = pipe.to("cpu")

    seed = args.seed if args.seed is not None else torch.seed() % (2**32 - 1)
    generator = torch.Generator(device=pipe.device).manual_seed(seed)

    image = pipe(
        prompt=args.prompt,
        negative_prompt=args.negative if args.negative else None,
        width=args.width,
        height=args.height,
        num_inference_steps=args.steps,
        guidance_scale=args.guidance,
        generator=generator,
    ).images[0]

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)

    metadata = {
        "prompt": args.prompt,
        "negativePrompt": args.negative,
        "checkpointFile": args.checkpoint,
        "vaeFile": args.vae or None,
        "width": args.width,
        "height": args.height,
        "steps": args.steps,
        "guidanceScale": args.guidance,
        "seed": seed,
    }
    metadata_path = output_path.with_suffix(".json")
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    result = {
        "outputPng": output_path.as_posix(),
        "metadataJson": metadata_path.as_posix(),
        "width": args.width,
        "height": args.height,
        "steps": args.steps,
        "guidanceScale": args.guidance,
        "seed": seed,
        "checkpointFile": args.checkpoint,
        "vaeFile": args.vae or None,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
