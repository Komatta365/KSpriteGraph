use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};
use image::{GenericImage, ImageBuffer, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
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
    pose_image: Option<String>,
    control_net_file: Option<String>,
    pose_strength: Option<f32>,
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
    pose_image: Option<String>,
    control_net_file: Option<String>,
    pose_strength: Option<f32>,
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
struct PostProcessSpriteRequest {
    input_png: String,
    output_png: String,
    pixel_size: u32,
    downscale_mode: Option<String>,
    save_intermediate_stages: Option<bool>,
    intermediate_dir: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PostProcessSpriteResult {
    input_png: String,
    output_png: String,
    pixel_size: u32,
    removed_background: bool,
    downscale_mode: Option<String>,
    save_intermediate_stages: Option<bool>,
    intermediate_dir: Option<String>,
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

#[tauri::command]
fn list_controlnet_models() -> Result<Vec<String>, String> {
    list_controlnet_models_impl().map_err(Into::into)
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

fn list_controlnet_models_impl() -> Result<Vec<String>, AppError> {
    let root = project_root()?;
    let controlnet_dir = root.join("models").join("controlnet");
    if !controlnet_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry_result in fs::read_dir(controlnet_dir)? {
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

    let output = run_generate_python(
        &python_script,
        &root,
        &request,
        &output_png,
    )?;
    let stdout_raw = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr_raw = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        return Err(AppError::PythonProcess(format!(
            "exit code: {:?}\nstdout:\n{}\nstderr:\n{}",
            output.status.code(),
            stdout_raw,
            stderr_raw
        )));
    }

    let stdout_json_line = stdout_raw
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .map(str::trim)
        .ok_or_else(|| {
            AppError::PythonProcess(format!(
                "python process returned empty output\nstderr:\n{}",
                stderr_raw
            ))
        })?;

    let result: DiffusersGenerateResult =
        serde_json::from_str(stdout_json_line).map_err(|error| {
            AppError::PythonProcess(format!(
                "failed to parse python JSON output: {error}\nstdout:\n{}\nstderr:\n{}",
                stdout_raw, stderr_raw
            ))
        })?;
    if !Path::new(&result.output_png).exists() {
        return Err(AppError::PythonProcess(format!(
            "python reported success but output PNG was not found: {}",
            result.output_png
        )));
    }

    Ok(result)
}

fn run_generate_python(
    python_script: &Path,
    root: &Path,
    request: &DiffusersGenerateRequest,
    output_png: &Path,
) -> Result<Output, AppError> {
    let mut common_args = vec![
        python_script.to_string_lossy().to_string(),
        "--project-root".to_string(),
        root.to_string_lossy().to_string(),
        "--prompt".to_string(),
        request.prompt.clone(),
        "--checkpoint".to_string(),
        request.checkpoint_file.clone(),
        "--output".to_string(),
        output_png.to_string_lossy().to_string(),
        "--width".to_string(),
        request.width.to_string(),
        "--height".to_string(),
        request.height.to_string(),
        "--steps".to_string(),
        request.steps.to_string(),
        "--guidance".to_string(),
        request.guidance_scale.to_string(),
    ];

    if let Some(negative_prompt) = &request.negative_prompt {
        if !negative_prompt.trim().is_empty() {
            common_args.push("--negative".to_string());
            common_args.push(negative_prompt.clone());
        }
    }
    if let Some(vae_file) = &request.vae_file {
        if !vae_file.trim().is_empty() {
            common_args.push("--vae".to_string());
            common_args.push(vae_file.clone());
        }
    }
    if let Some(pose_image) = &request.pose_image {
        if !pose_image.trim().is_empty() {
            common_args.push("--pose-image".to_string());
            common_args.push(pose_image.clone());
        }
    }
    if let Some(control_net_file) = &request.control_net_file {
        if !control_net_file.trim().is_empty() {
            common_args.push("--controlnet".to_string());
            common_args.push(control_net_file.clone());
        }
    }
    if let Some(pose_strength) = request.pose_strength {
        common_args.push("--pose-strength".to_string());
        common_args.push(pose_strength.to_string());
    }
    if let Some(seed) = request.seed {
        common_args.push("--seed".to_string());
        common_args.push(seed.to_string());
    }

    let candidates: [(&str, &[&str]); 3] = [("python", &[]), ("py", &["-3"]), ("python3", &[])];
    let mut attempted: Vec<String> = Vec::new();
    for (exe, prefix_args) in candidates {
        let mut cmd = Command::new(exe);
        for arg in prefix_args {
            cmd.arg(arg);
        }
        for arg in &common_args {
            cmd.arg(arg);
        }

        match cmd.output() {
            Ok(output) => {
                if output.status.code() == Some(9009) {
                    attempted.push(format!("{exe} (exit code 9009)"));
                    continue;
                }
                return Ok(output);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                attempted.push(format!("{exe} (not found)"));
            }
            Err(error) => return Err(AppError::Io(error)),
        }
    }

    Err(AppError::InvalidRequest(format!(
        "python runtime not found. tried: {}. Install Python and ensure `python` or `py -3` is available in PATH.",
        attempted.join(", ")
    )))
}

#[tauri::command]
async fn build_sprite_sheet(request: BuildSpriteSheetRequest) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || build_sprite_sheet_impl(request))
        .await
        .map_err(|join_error| format!("spawn_blocking error: {join_error}"))?
        .map_err(Into::into)
}

#[tauri::command]
async fn process_generated_sprite(
    request: PostProcessSpriteRequest,
) -> Result<PostProcessSpriteResult, String> {
    tauri::async_runtime::spawn_blocking(move || process_generated_sprite_impl(request))
        .await
        .map_err(|join_error| format!("spawn_blocking error: {join_error}"))?
        .map_err(Into::into)
}

#[tauri::command]
fn read_image_data_url(path: String) -> Result<String, String> {
    read_image_data_url_impl(path).map_err(Into::into)
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

fn process_generated_sprite_impl(
    request: PostProcessSpriteRequest,
) -> Result<PostProcessSpriteResult, AppError> {
    if request.pixel_size == 0 {
        return Err(AppError::InvalidRequest(
            "pixelSize must be greater than 0".to_string(),
        ));
    }

    let root = project_root()?;
    let input_png = root.join(&request.input_png);
    if !input_png.exists() {
        return Err(AppError::InvalidRequest(format!(
            "input image does not exist: {}",
            input_png.display()
        )));
    }

    let output_png = root.join(&request.output_png);
    if let Some(parent) = output_png.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    let python_script = root.join("ai").join("postprocess_sprite.py");
    if !python_script.exists() {
        return Err(AppError::InvalidRequest(format!(
            "post-process script not found: {}",
            python_script.display()
        )));
    }

    let output = run_postprocess_python(
        &python_script,
        &input_png,
        &output_png,
        request.pixel_size,
        request.downscale_mode,
        request.save_intermediate_stages,
        request.intermediate_dir.as_deref(),
    )?;
    let stdout_raw = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr_raw = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        return Err(AppError::PythonProcess(format!(
            "exit code: {:?}\nstdout:\n{}\nstderr:\n{}",
            output.status.code(),
            stdout_raw,
            stderr_raw
        )));
    }

    let stdout_json_line = stdout_raw
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .map(str::trim)
        .ok_or_else(|| {
            AppError::PythonProcess(format!(
                "python process returned empty output\nstderr:\n{}",
                stderr_raw
            ))
        })?;

    let result: PostProcessSpriteResult = serde_json::from_str(stdout_json_line).map_err(|error| {
        AppError::PythonProcess(format!(
            "failed to parse python JSON output: {error}\nstdout:\n{}\nstderr:\n{}",
            stdout_raw, stderr_raw
        ))
    })?;

    if !Path::new(&result.output_png).exists() {
        return Err(AppError::PythonProcess(format!(
            "python reported success but output PNG was not found: {}",
            result.output_png
        )));
    }

    Ok(result)
}

fn run_postprocess_python(
    python_script: &Path,
    input_png: &Path,
    output_png: &Path,
    pixel_size: u32,
    downscale_mode: Option<String>,
    save_intermediate_stages: Option<bool>,
    intermediate_dir: Option<&str>,
) -> Result<Output, AppError> {
    let mut common_args = vec![
        python_script.to_string_lossy().to_string(),
        "--input".to_string(),
        input_png.to_string_lossy().to_string(),
        "--output".to_string(),
        output_png.to_string_lossy().to_string(),
        "--pixel-size".to_string(),
        pixel_size.to_string(),
    ];

    if let Some(mode) = downscale_mode {
        if !mode.trim().is_empty() {
            common_args.push("--downscale-mode".to_string());
            common_args.push(mode);
        }
    }

    if save_intermediate_stages == Some(true) {
        common_args.push("--save-intermediates".to_string());
        if let Some(dir) = intermediate_dir {
            if !dir.trim().is_empty() {
                common_args.push("--intermediate-dir".to_string());
                common_args.push(dir.to_string());
            }
        }
    }

    let candidates: [(&str, &[&str]); 3] = [("python", &[]), ("py", &["-3"]), ("python3", &[])];
    let mut attempted: Vec<String> = Vec::new();
    for (exe, prefix_args) in candidates {
        let mut cmd = Command::new(exe);
        for arg in prefix_args {
            cmd.arg(arg);
        }
        for arg in &common_args {
            cmd.arg(arg);
        }

        match cmd.output() {
            Ok(output) => {
                if output.status.code() == Some(9009) {
                    attempted.push(format!("{exe} (exit code 9009)"));
                    continue;
                }
                return Ok(output);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                attempted.push(format!("{exe} (not found)"));
            }
            Err(error) => return Err(AppError::Io(error)),
        }
    }

    Err(AppError::InvalidRequest(format!(
        "python runtime not found. tried: {}. Install Python and ensure `python` or `py -3` is available in PATH.",
        attempted.join(", ")
    )))
}

fn read_image_data_url_impl(path: String) -> Result<String, AppError> {
    let root = project_root()?;
    let target = if Path::new(&path).is_absolute() {
        PathBuf::from(&path)
    } else {
        root.join(&path)
    };
    let canonical = target.canonicalize()?;

    let bytes = fs::read(&canonical)?;
    let mime_type = match canonical.extension().and_then(|ext| ext.to_str()).unwrap_or_default() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "application/octet-stream",
    };

    let encoded = BASE64_STANDARD.encode(bytes);
    Ok(format!("data:{mime_type};base64,{encoded}"))
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            health_check,
            list_local_models,
            list_controlnet_models,
            generate_with_diffusers,
            build_sprite_sheet,
            process_generated_sprite,
            read_image_data_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
