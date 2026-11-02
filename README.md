# KSpriteGraph

Rust + Tauri + Next.js + Python(Diffusers) で構築する、SDXLベースの画像生成/スプライト生成ツールです。

## 全体構成

```text
Visual Script Editor (TypeScript + Tauri)
        │
        ▼
Image Generation Service (Python)
        │
        ▼
Diffusers
        │
        ▼
SDXL
```

## フォルダ構成

```text
KSpriteGraph/
├ frontend/                # Next.js + React + TypeScript
├ src-tauri/               # Rust (Tauri backend)
├ ai/                      # Python image service
│  ├ generate.py
│  └ requirements.txt
└ models/
   ├ checkpoints/          # SDXL / DreamShaperXL / JuggernautXL など
   ├ vae/
   ├ loras/
   ├ controlnet/
   └ upscale/
```

## セットアップ

### 1) Frontend 依存関係

```bash
cd frontend
npm install
```

### 2) Python 依存関係

```bash
python -m pip install -r ai/requirements.txt
```

### 3) モデル配置

- `models/checkpoints/` に `.safetensors` または `.ckpt` を配置
- `models/vae/` に VAE ファイルを配置（任意）

例:

- `models/checkpoints/sd_xl_base_1.0.safetensors`
- `models/checkpoints/DreamShaperXL.safetensors`
- `models/checkpoints/JuggernautXL.safetensors`
- `models/vae/sdxl_vae_fp16_fix.safetensors`

### 4) 起動

```bash
cd frontend
npm run tauri dev
```

## 実装済み機能

- VS Code風UI（メニューバー / サイドバー / ステータスバー / ドッキングウインドウ）
- Command Palette (`Ctrl+K`)
- ノードグラフUI（Visual Editor → Python Service → Diffusers → SDXL）
- Diffusers 直接呼び出し（Rust -> Python `ai/generate.py`）
- ローカル checkpoint モデル一覧の取得
- モデル別生成プリセット（SDXL Base / DreamShaperXL / JuggernautXL）
- `models/checkpoints` 走査による自動プリセット候補（未定義モデルを `Auto (...)` として追加）
- 生成画像 PNG 出力 + 生成メタデータ JSON 出力
- Sprite Sheet Builder（列数 / パディング / ソート順 / メタデータJSON）

## 補足

- Python 実行は `python` コマンドを使用します。環境に応じて必要なら `python3` へ変更してください。
- CUDA が利用可能な場合は GPU 実行、利用不可の場合は CPU 実行になります。
