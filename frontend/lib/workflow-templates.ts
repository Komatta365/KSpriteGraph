export type WorkflowPreset = "sdxl" | "animagine";

export type WorkflowFeatures = {
  lora: boolean;
  controlNet: boolean;
  ipAdapter: boolean;
  animateDiff: boolean;
};

type WorkflowNode = {
  class_type: string;
  inputs: Record<string, unknown>;
};

type NodeMap = Record<string, WorkflowNode>;

type BuildContext = {
  nodes: NodeMap;
  nextId: number;
  availableNodeTypes?: Set<string>;
};

function addNode(
  ctx: BuildContext,
  classType: string,
  inputs: Record<string, unknown>
): string {
  const id = String(ctx.nextId++);
  ctx.nodes[id] = {
    class_type: classType,
    inputs
  };
  return id;
}

export function buildWorkflowTemplate(
  preset: WorkflowPreset,
  features: WorkflowFeatures,
  availableNodeTypes?: string[]
): Record<string, WorkflowNode> {
  const availableTypeSet = availableNodeTypes
    ? new Set(availableNodeTypes)
    : undefined;
  const modelFileName =
    preset === "animagine"
      ? "animagine-xl-4.0.safetensors"
      : "sd_xl_base_1.0.safetensors";

  const ctx: BuildContext = {
    nodes: {},
    nextId: 1,
    availableNodeTypes: availableTypeSet
  };

  const resolveNodeType = (candidates: string[]): string => {
    if (!ctx.availableNodeTypes || candidates.length === 0) {
      return candidates[0] ?? "";
    }
    for (const nodeType of candidates) {
      if (ctx.availableNodeTypes.has(nodeType)) {
        return nodeType;
      }
    }
    return candidates[0];
  };

  const checkpoint = addNode(ctx, resolveNodeType(["CheckpointLoaderSimple"]), {
    ckpt_name: modelFileName
  });

  let modelOutput: [string, number] = [checkpoint, 0];
  let clipOutput: [string, number] = [checkpoint, 1];
  const vaeOutput: [string, number] = [checkpoint, 2];

  if (features.lora) {
    const lora = addNode(ctx, resolveNodeType(["LoraLoader", "LoRALoader"]), {
      model: modelOutput,
      clip: clipOutput,
      lora_name: "example-lora.safetensors",
      strength_model: 0.8,
      strength_clip: 0.8
    });
    modelOutput = [lora, 0];
    clipOutput = [lora, 1];
  }

  const positive = addNode(ctx, resolveNodeType(["CLIPTextEncode"]), {
    text: "masterpiece, best quality, full body sprite character, transparent background",
    clip: clipOutput
  });
  const negative = addNode(ctx, resolveNodeType(["CLIPTextEncode"]), {
    text: "low quality, blurry, jpeg artifacts, watermark",
    clip: clipOutput
  });
  let positiveConditioning: [string, number] = [positive, 0];
  let negativeConditioning: [string, number] = [negative, 0];

  const latent = addNode(ctx, resolveNodeType(["EmptyLatentImage"]), {
    width: 1024,
    height: 1024,
    batch_size: features.animateDiff ? 8 : 1
  });

  if (features.controlNet) {
    const poseInput = addNode(ctx, resolveNodeType(["LoadImage"]), {
      image: "controlnet_pose.png",
      upload: "image"
    });
    const openPose = addNode(
      ctx,
      resolveNodeType([
        "OpenPosePreprocessor",
        "DWPreprocessor",
        "DWPose_Preprocessor"
      ]),
      {
      image: [poseInput, 0],
      detect_hand: "enable",
      detect_body: "enable",
      detect_face: "enable"
    });
    const controlNetLoader = addNode(ctx, resolveNodeType(["ControlNetLoader"]), {
      control_net_name: "controlnet-openpose-sdxl.safetensors"
    });
    const controlNetApply = addNode(
      ctx,
      resolveNodeType(["ControlNetApplyAdvanced", "ControlNetApply"]),
      {
      positive: positiveConditioning,
      negative: negativeConditioning,
      control_net: [controlNetLoader, 0],
      image: [openPose, 0],
      strength: 1.0,
      start_percent: 0.0,
      end_percent: 1.0
    });
    positiveConditioning = [controlNetApply, 0];
    negativeConditioning = [controlNetApply, 1];
  }

  if (features.ipAdapter) {
    const ipAdapterModel = addNode(
      ctx,
      resolveNodeType(["IPAdapterModelLoader", "IPAdapterUnifiedLoader"]),
      {
      ipadapter_file: "ip-adapter_sdxl.bin"
    });
    const clipVision = addNode(ctx, resolveNodeType(["CLIPVisionLoader"]), {
      clip_name: "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
    });
    const referenceImage = addNode(ctx, resolveNodeType(["LoadImage"]), {
      image: "ipadapter_reference.png",
      upload: "image"
    });
    const ipAdapterApply = addNode(
      ctx,
      resolveNodeType(["IPAdapterApply", "IPAdapterAdvanced"]),
      {
      model: modelOutput,
      ipadapter: [ipAdapterModel, 0],
      image: [referenceImage, 0],
      clip_vision: [clipVision, 0],
      weight: 0.7,
      weight_type: "linear",
      combine_embeds: "concat",
      start_at: 0,
      end_at: 1
    });
    modelOutput = [ipAdapterApply, 0];
  }

  if (features.animateDiff) {
    const animateDiffLoader = addNode(
      ctx,
      resolveNodeType(["ADE_AnimateDiffLoader", "AnimateDiffLoader"]),
      {
      model: modelOutput,
      model_name: "mm_sdxl_v10_beta.ckpt",
      context_options: "uniform"
    });
    modelOutput = [animateDiffLoader, 0];
  }

  const sampler = addNode(ctx, resolveNodeType(["KSampler"]), {
    seed: 123456,
    steps: 30,
    cfg: 7,
    sampler_name: "dpmpp_2m",
    scheduler: "karras",
    denoise: 1,
    model: modelOutput,
    positive: positiveConditioning,
    negative: negativeConditioning,
    latent_image: [latent, 0]
  });

  const decode = addNode(ctx, resolveNodeType(["VAEDecode"]), {
    samples: [sampler, 0],
    vae: vaeOutput
  });

  addNode(ctx, resolveNodeType(["SaveImage"]), {
    filename_prefix: "KSpriteGraph",
    images: [decode, 0]
  });

  return ctx.nodes;
}
