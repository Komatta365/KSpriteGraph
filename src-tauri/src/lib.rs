use image::{GenericImage, ImageBuffer, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::SystemTime,
};
use thiserror::Error;

#[derive(Debug, Error)]
enum AppError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("image error: {0}")]
    Image(#[from] image::ImageError),
    #[error("invalid request: {0}")]
    InvalidRequest(String),
    #[error("python process failed: {0}")]
    PythonProcess(String),
}

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiffusersGenerateRequest {
    prompt: String,
    negative_prompt: Option<String>,
    checkpoint_file: String,
    vae_file: Option<String>,
    output_png: String,
    width: u32,
    height: u32,
    steps: u32,
    guidance_scale: f32,
    seed: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiffusersGenerateResult {
    output_png: String,
    metadata_json: String,
    width: u32,
    height: u32,
    steps: u32,
    guidance_scale: f32,
    seed: u64,
    checkpoint_file: String,
    vae_file: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildSpriteSheetRequest {
    input_dir: String,
    output_png: String,
    columns: u32,
    padding: u32,
    sort_order: SpriteSortOrder,
    metadata_output_json: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
enum SpriteSortOrder {
    NameAsc,
    NameDesc,
    ModifiedAsc,
    ModifiedDesc,
}

#[derive(Debug, Serialize)]
struct SpriteSheetFrameMetadata {
    filename: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Serialize)]
struct SpriteSheetMetadata {
    image: String,
    columns: u32,
    rows: u32,
    frame_width: u32,
    frame_height: u32,
    padding: u32,
    frame_count: usize,
    frames: Vec<SpriteSheetFrameMetadata>,
}

fn project_root() -> Result<PathBuf, AppError> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| AppError::InvalidRequest("failed to resolve project root".to_string()))
}

#[tauri::command]
fn health_check() -> String {
    "Rust backend ready".to_string()
}

#[tauri::command]
fn list_local_models() -> Result<Vec<String>, String> {
    list_local_models_impl().map_err(Into::into)
}

fn list_local_models_impl() -> Result<Vec<String>, AppError> {
    let root = project_root()?;
    let checkpoints = root.join("models").join("checkpoints");
    if !checkpoints.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry_result in fs::read_dir(checkpoints)? {
        let entry = entry_result?;
        let path = entry.path();
        let ext = path.extension().and_then(|v| v.to_str()).unwrap_or_default();
        if ext.eq_ignore_ascii_case("safetensors") || ext.eq_ignore_ascii_case("ckpt") {
            if let Some(name) = path.file_name().and_then(|v| v.to_str()) {
                files.push(name.to_string());
            }
        }
    }
    files.sort();
    Ok(files)
}

#[tauri::command]
async fn generate_with_diffusers(
    request: DiffusersGenerateRequest,
) -> Result<DiffusersGenerateResult, String> {
    tauri::async_runtime::spawn_blocking(move || generate_with_diffusers_impl(request))
        .await
        .map_err(|join_error| format!("spawn_blocking error: {join_error}"))?
        .map_err(Into::into)
}

fn generate_with_diffusers_impl(
    request: DiffusersGenerateRequest,
) -> Result<DiffusersGenerateResult, AppError> {
    if request.prompt.trim().is_empty() {
        return Err(AppError::InvalidRequest("prompt is empty".to_string()));
    }
    if request.checkpoint_file.trim().is_empty() {
        return Err(AppError::InvalidRequest("checkpointFile is empty".to_string()));
    }
    if request.width == 0 || request.height == 0 {
        return Err(AppError::InvalidRequest(
            "width and height must be greater than 0".to_string(),
        ));
    }
    if request.steps == 0 {
        return Err(AppError::InvalidRequest(
            "steps must be greater than 0".to_string(),
        ));
    }

    let root = project_root()?;
    let python_script = root.join("ai").join("generate.py");
    if !python_script.exists() {
        return Err(AppError::InvalidRequest(format!(
            "python script not found: {}",
            python_script.display()
        )));
    }

    let output_png = root.join(&request.output_png);
    if let Some(parent) = output_png.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    let mut cmd = Command::new("python");
    cmd.arg(python_script)
        .arg("--project-root")
        .arg(root)
        .arg("--prompt")
        .arg(&request.prompt)
        .arg("--checkpoint")
        .arg(&request.checkpoint_file)
        .arg("--output")
        .arg(&output_png)
        .arg("--width")
        .arg(request.width.to_string())
        .arg("--height")
        .arg(request.height.to_string())
        .arg("--steps")
        .arg(request.steps.to_string())
        .arg("--guidance")
        .arg(request.guidance_scale.to_string());

    if let Some(negative_prompt) = &request.negative_prompt {
        if !negative_prompt.trim().is_empty() {
            cmd.arg("--negative").arg(negative_prompt);
        }
    }
    if let Some(vae_file) = &request.vae_file {
        if !vae_file.trim().is_empty() {
            cmd.arg("--vae").arg(vae_file);
        }
    }
    if let Some(seed) = request.seed {
        cmd.arg("--seed").arg(seed.to_string());
    }

    let output = cmd.output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AppError::PythonProcess(stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Err(AppError::PythonProcess(
            "python process returned empty output".to_string(),
        ));
    }

    let result: DiffusersGenerateResult = serde_json::from_str(&stdout)?;
    Ok(result)
}

#[tauri::command]
async fn build_sprite_sheet(request: BuildSpriteSheetRequest) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || build_sprite_sheet_impl(request))
        .await
        .map_err(|join_error| format!("spawn_blocking error: {join_error}"))?
        .map_err(Into::into)
}

fn build_sprite_sheet_impl(request: BuildSpriteSheetRequest) -> Result<String, AppError> {
    if request.columns == 0 {
        return Err(AppError::InvalidRequest(
            "columns must be greater than 0".to_string(),
        ));
    }

    let root = project_root()?;
    let input_dir = root.join(&request.input_dir);
    if !input_dir.exists() {
        return Err(AppError::InvalidRequest(format!(
            "inputDir does not exist: {}",
            input_dir.display()
        )));
    }

    let mut frames = collect_png_frames(&input_dir)?;
    if frames.is_empty() {
        return Err(AppError::InvalidRequest(format!(
            "no PNG files found in {}",
            input_dir.display()
        )));
    }
    sort_frames(&mut frames, &request.sort_order);

    let first = image::open(&frames[0])?.to_rgba8();
    let frame_width = first.width();
    let frame_height = first.height();
    let rows = (frames.len() as u32).div_ceil(request.columns);
    let sheet_width =
        frame_width * request.columns + request.padding * request.columns.saturating_sub(1);
    let sheet_height = frame_height * rows + request.padding * rows.saturating_sub(1);

    let mut sheet: RgbaImage =
        ImageBuffer::from_pixel(sheet_width, sheet_height, Rgba([0, 0, 0, 0]));
    let mut metadata_frames = Vec::with_capacity(frames.len());

    for (index, path) in frames.iter().enumerate() {
        let frame = image::open(path)?.to_rgba8();
        if frame.width() != frame_width || frame.height() != frame_height {
            return Err(AppError::InvalidRequest(format!(
                "frame size mismatch: {}",
                path.display()
            )));
        }

        let i = index as u32;
        let col = i % request.columns;
        let row = i / request.columns;
        let x = col * (frame_width + request.padding);
        let y = row * (frame_height + request.padding);
        sheet.copy_from(&frame, x, y)?;

        let filename = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| {
                AppError::InvalidRequest(format!("invalid frame file name: {}", path.display()))
            })?
            .to_string();
        metadata_frames.push(SpriteSheetFrameMetadata {
            filename,
            x,
            y,
            width: frame_width,
            height: frame_height,
        });
    }

    let output_png = root.join(&request.output_png);
    if let Some(parent) = output_png.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    sheet.save(&output_png)?;

    if let Some(metadata_path) = request.metadata_output_json {
        let metadata = SpriteSheetMetadata {
            image: output_png.to_string_lossy().to_string(),
            columns: request.columns,
            rows,
            frame_width,
            frame_height,
            padding: request.padding,
            frame_count: metadata_frames.len(),
            frames: metadata_frames,
        };
        write_metadata_file(&root.join(metadata_path), &metadata)?;
    }

    Ok(output_png.to_string_lossy().to_string())
}

fn collect_png_frames(input_dir: &Path) -> Result<Vec<PathBuf>, AppError> {
    let mut frames = Vec::new();
    for entry_result in fs::read_dir(input_dir)? {
        let entry = entry_result?;
        let path = entry.path();
        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("png"))
            .unwrap_or(false)
        {
            frames.push(path);
        }
    }
    Ok(frames)
}

fn sort_frames(frames: &mut [PathBuf], sort_order: &SpriteSortOrder) {
    match sort_order {
        SpriteSortOrder::NameAsc => {
            frames.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
        }
        SpriteSortOrder::NameDesc => {
            frames.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
        }
        SpriteSortOrder::ModifiedAsc => {
            frames.sort_by(|a, b| modified_time(a).cmp(&modified_time(b)));
        }
        SpriteSortOrder::ModifiedDesc => {
            frames.sort_by(|a, b| modified_time(b).cmp(&modified_time(a)));
        }
    }
}

fn modified_time(path: &Path) -> SystemTime {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH)
}

fn write_metadata_file(path: &Path, metadata: &SpriteSheetMetadata) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    let json = serde_json::to_string_pretty(metadata)?;
    fs::write(path, json)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            health_check,
            list_local_models,
            generate_with_diffusers,
            build_sprite_sheet
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
