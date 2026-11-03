import argparse
import json
from pathlib import Path

import torch
from diffusers import AutoencoderKL, ControlNetModel, StableDiffusionXLPipeline
from diffusers import StableDiffusionXLControlNetPipeline
from diffusers.utils import load_image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate image with Diffusers SDXL")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--negative", default="")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--vae", default="")
    parser.add_argument("--pose-image", default="")
    parser.add_argument("--controlnet", default="")
    parser.add_argument("--pose-strength", type=float, default=1.0)
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--guidance", type=float, default=7.0)
    parser.add_argument("--seed", type=int)
    return parser.parse_args()


def _resolve_relative_path(root: Path, value: str, *, subdir: str) -> Path:
    candidate = Path(value)
    if not candidate.is_absolute():
        candidate = root / subdir / value
    return candidate


def main() -> None:
    args = parse_args()
    root = Path(args.project_root).resolve()
    checkpoint_path = root / "models" / "checkpoints" / args.checkpoint
    if not checkpoint_path.exists():
        raise FileNotFoundError(f"checkpoint not found: {checkpoint_path}")

    vae_path = None
    if args.vae:
        vae_candidate = _resolve_relative_path(root, args.vae, subdir="models/vae")
        if not vae_candidate.exists():
            raise FileNotFoundError(f"vae not found: {vae_candidate}")
        vae_path = vae_candidate

    pose_image_path = None
    if args.pose_image:
        pose_candidate = _resolve_relative_path(root, args.pose_image, subdir="")
        if not pose_candidate.exists():
            raise FileNotFoundError(f"pose image not found: {pose_candidate}")
        pose_image_path = pose_candidate

    controlnet_path = None
    if pose_image_path is not None:
        if args.controlnet:
            controlnet_candidate = _resolve_relative_path(root, args.controlnet, subdir="models/controlnet")
        else:
            controlnet_candidate = root / "models" / "controlnet" / "controlnet-openpose-sdxl.safetensors"
        if not controlnet_candidate.exists():
            raise FileNotFoundError(
                "DWPose/controlnet model not found. Place a ControlNet pose model under models/controlnet/ or pass --controlnet. "
                f"Expected: {controlnet_candidate}"
            )
        controlnet_path = controlnet_candidate

    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    if pose_image_path is not None and controlnet_path is not None:
        controlnet = ControlNetModel.from_single_file(
            controlnet_path.as_posix(), torch_dtype=dtype, use_safetensors=True
        )
        pipe = StableDiffusionXLControlNetPipeline.from_single_file(
            checkpoint_path.as_posix(),
            controlnet=controlnet,
            torch_dtype=dtype,
            use_safetensors=True,
        )
    else:
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

    if pose_image_path is not None and controlnet_path is not None:
        pose_image = load_image(pose_image_path.as_posix()).convert("RGB")
        image = pipe(
            prompt=args.prompt,
            negative_prompt=args.negative if args.negative else None,
            image=pose_image,
            controlnet_conditioning_scale=max(0.0, min(2.0, args.pose_strength)),
            width=args.width,
            height=args.height,
            num_inference_steps=args.steps,
            guidance_scale=args.guidance,
            generator=generator,
        ).images[0]
    else:
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
        "poseImage": args.pose_image or None,
        "controlNetFile": args.controlnet or None,
        "poseStrength": args.pose_strength,
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
        "poseImage": args.pose_image or None,
        "controlNetFile": args.controlnet or None,
        "poseStrength": args.pose_strength,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
