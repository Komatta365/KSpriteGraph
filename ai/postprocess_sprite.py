import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torchvision import transforms
from transformers import AutoModelForImageSegmentation


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Use BiRefNet to remove the background and output a 64x64 sprite"
    )
    parser.add_argument("--input", required=True, help="Input PNG path")
    parser.add_argument("--output", required=True, help="Output PNG path")
    parser.add_argument("--pixel-size", type=int, default=64, help="Target sprite size")
    parser.add_argument(
        "--downscale-mode",
        choices=["area", "lanczos", "nearest-neighbor", "nearestneighbor"],
        default="nearest-neighbor",
        help="Resize method used for the reduction passes. Default keeps the final 128->64 pass in nearest-neighbor for pixel-art output.",
    )
    parser.add_argument(
        "--save-intermediates",
        action="store_true",
        default=False,
        help="Save intermediate reduction stages (1024 -> 512 -> ... -> 64)",
    )
    parser.add_argument(
        "--intermediate-dir",
        default="",
        help="Optional directory for intermediate stage output PNGs",
    )
    return parser.parse_args()


def load_model(device: torch.device) -> torch.nn.Module:
    model = AutoModelForImageSegmentation.from_pretrained(
        "zhengpeng7/BiRefNet",
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    model = model.to(device).float()
    model.eval()
    return model


def preprocess_image(image: Image.Image) -> torch.Tensor:
    transform = transforms.Compose(
        [
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    return transform(image).unsqueeze(0)


def apply_mask_to_image(image: Image.Image, mask: np.ndarray) -> Image.Image:
    rgba = image.convert("RGBA")
    rgba_array = np.array(rgba)
    alpha = np.clip(mask, 0.0, 1.0)
    rgba_array[:, :, 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(rgba_array, mode="RGBA")


def resolve_resize_method(mode: str) -> Image.Resampling:
    normalized = mode.lower().replace("_", "-")
    mode_map = {
        "area": Image.Resampling.BOX,
        "box": Image.Resampling.BOX,
        "lanczos": Image.Resampling.LANCZOS,
        "nearest": Image.Resampling.NEAREST,
        "nearest-neighbor": Image.Resampling.NEAREST,
        "nearestneighbor": Image.Resampling.NEAREST,
    }
    try:
        return mode_map[normalized]
    except KeyError as exc:
        raise ValueError(f"unsupported downscale mode: {mode}") from exc


def build_downsample_plan(width: int, height: int, target_size: int) -> list[tuple[int, int]]:
    plan: list[tuple[int, int]] = []
    current_width, current_height = width, height
    while max(current_width, current_height) > target_size:
        plan.append((current_width, current_height))
        current_width = max(1, current_width // 2)
        current_height = max(1, current_height // 2)
    plan.append((target_size, target_size))
    return plan


def pixelate(
    image: Image.Image,
    pixel_size: int,
    save_stages: bool = False,
    stage_dir: str = "",
    downscale_mode: str = "lanczos",
) -> Image.Image:
    if pixel_size <= 0:
        raise ValueError("pixel size must be greater than zero")

    current = image.convert("RGBA")
    stages = build_downsample_plan(current.width, current.height, pixel_size)
    resize_mode = resolve_resize_method(downscale_mode)
    stage_count = len(stages) - 1

    for index, (stage_width, stage_height) in enumerate(stages[:-1], start=1):
        target_resample = resize_mode
        if index == stage_count:
            target_resample = Image.Resampling.NEAREST
        current = current.resize((stage_width, stage_height), resample=target_resample)
        if save_stages and stage_dir:
            stage_path = Path(stage_dir) / f"stage-{index}-{stage_width}x{stage_height}.png"
            stage_path.parent.mkdir(parents=True, exist_ok=True)
            current.save(stage_path)

    final_width, final_height = stages[-1]
    if current.size != (final_width, final_height):
        current = current.resize((final_width, final_height), resample=Image.Resampling.NEAREST)
    return current


def main() -> None:
    args = parse_args()
    source = Path(args.input).resolve()
    output = Path(args.output).resolve()
    if not source.exists():
        raise FileNotFoundError(f"input image not found: {source}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_model(device)
    image = Image.open(source).convert("RGB")
    input_tensor = preprocess_image(image).to(device)

    with torch.inference_mode():
        prediction = model(input_tensor)[-1].sigmoid().to(torch.float32).cpu()

    mask = prediction[0].squeeze().numpy()
    mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-6)
    mask = np.clip(mask, 0.0, 1.0)
    mask_image = Image.fromarray((mask * 255).astype(np.uint8), mode="L").resize(
        image.size,
        resample=Image.Resampling.BILINEAR,
    )
    alpha_mask = np.asarray(mask_image, dtype=np.float32) / 255.0
    masked_image = apply_mask_to_image(image, alpha_mask)
    stage_dir = args.intermediate_dir or ""
    sprite = pixelate(
        masked_image,
        args.pixel_size,
        save_stages=args.save_intermediates,
        stage_dir=stage_dir,
        downscale_mode=args.downscale_mode,
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    sprite.save(output)

    result = {
        "inputPng": source.as_posix(),
        "outputPng": output.as_posix(),
        "pixelSize": args.pixel_size,
        "removedBackground": True,
        "saveIntermediateStages": args.save_intermediates,
        "intermediateDir": stage_dir,
        "downscaleMode": args.downscale_mode,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
