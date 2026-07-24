# M3-T4 embedding モデル整合性検証（revision/hash pinning）の設計決定

TASK-28 で実装した、embedding モデルファイルの改ざん/破損/差し替え検知機構の設計記録。
設計書 `tmp/dev/plan/design.md` §10.2/§11 の「revision/hash pinning + ローカルパス + offline mode」を実装したもの。

## 背景（インシデント）

M3-T1/T2 実装中、非量子化 `model.onnx` が golden 生成後に別内容へ上書きされる事象が発生。
TASK-28 調査（2026-07-24・高確度）で原因を特定:

- **原因**: 2026-07-15 09:07:13 に PoC スクリプト `tmp/dev/poc/vector-poc/ts/gen-golden-nq.ts` を実行。
  `@xenova/transformers` が **revision 未固定** で `Xenova/multilingual-e5-small` の非量子化 ONNX
  （`{ quantized: false }`）を HF から auto-download し、09:08:14 に `model.onnx` を上書きした。
- **`model.onnx` は破損していなかった**: `golden-nq.json`（非量子化 golden・同時生成）と整合。
  M3-T1/T2 が観測した「不整合」は非量子化モデルを量子化 golden と比較したクロスモデル差。
- **根本問題**: revision pinning が無いと transformers.js の自動 DL が常に "main" 最新を取得し、
  再実行のたびに別内容が混入しうる。

詳細は [[m3-t1-t2-vector-search-embedding-decisions]] の §2（再定式化）参照。

## 現状（実装内容）

`crates/ygo-search/src/vector/integrity.rs`（`vector-search` feature 配下）に整合性検証を実装。

- **期待ハッシュ表**: `crates/ygo-search/src/vector/models.sha256`（`sha256sum -b` 互換の
  `<hash> *<relpath>` 形式 + `# revision:`/`# model:` 等のコメント行）。
  対象: `onnx/model_quantized.onnx`, `onnx/model.onnx`, `tokenizer.json`。
  HF revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78` に pin。
- **バイナリ埋め込み**: `include_str!("models.sha256")` で SDK バイナリに埋め込み
  （`embedded_manifest()`・`OnceLock` + parse・`.expect()` でビルド時不変条件）。
  マニフェストをモデル隣接ではなく **バイナリ埋め込み** する理由: モデル隣接マニフェストだと
  再 DL 時に再生成され検出を逃すため。埋め込みで wrong revision / 破損 / 改ざんを検出できる。
- **ロード時検証**: `Embedder::new()`（`embeddings.rs`）で `ort`/`tokenizers` ロード前に
  `verify_model_files(model_dir, &[model_path, tokenizer_path], manifest)` を呼ぶ。
  hash 不一致 → `VectorError::ModelIntegrity`（fail-fast・470MB 無駄ロード回避）。OnceLock 初期化時1回のみ。
- **relpath 計算**: `relpath_under(model_dir, path)` は `Component::Normal` のみ許可
  （絶対パス/`../`/model_dir 外 → `None`）。`canonicalize` しない（IO 回避）。
- **検証の既定（緩い）**: マニフェストに対象エントリがあれば検証・なければ warn+skip。
  - `YGO_SEARCH_STRICT_MODEL_VERIFY=1`: エントリ無/relpath 計算不能 → `VectorError::UnverifiableModelPath`。
  - `YGO_SEARCH_SKIP_MODEL_VERIFY=1`: 全バイパス（**SKIP は STRICT より優先**・緊急脱出）。

## 脅威モデル・範囲外

- **脅威モデル**: accidental revision overwrite（モデルが別 revision で再取得される等の事故）。
  本機構はこれをロード時に検出する。
- **範囲外**: adversarial in-process TOCTOU（hash 計算 → `commit_from_file` 間の差し替え）。
  ort が FD を扱う間の一致性保証は別課題。ドキュメントでの明示のみ。
- **TS 側（`src/lib/vector/embeddings.ts`）の revision pinning**: 別件（TS SDK）。本タスクは Rust SDK のみ。

## 運用

- **マニフェスト再生成**: `scripts/setup/gen-model-manifest.sh <MODEL_DIR> [OUTPUT]`
  （GNU coreutils `sha256sum` 推奨・macOS は `shasum -a 256` fallback）。
- **手動検証**: `grep -v '^#' models.sha256 | sha256sum -c -`（コメント行を除けば sha256sum 互換）。
- **ドリフト検出テスト**: `tests/vector_embeddings.rs` の `embedded_manifest_matches_actual_model_files`
  （`#[ignore]`・`YGO_SEARCH_MODEL_DIR` 指定で手動実行）が「マニフェストが古くなった」を検出する門番。
  PoC モデルで実行するたびに manifest↔実ファイルの乖離を検出。

## 検証結果（2026-07-24）

- 量子化 `model_quantized.onnx` ↔ `golden.json`: 7/8 cosine 1.0、s5 cosine 0.999269（量子化差・pass）。
- 非量子化 `model.onnx` ↔ `golden-nq.json`: 8/8 cosine 1.0 / max_abs_diff ~6e-8（完全一致・破損否定）。
- `model-search` feature 全ビルド OK、`integrity` unit test 19件 + orchestration 7件 green、clippy クリーン。

## 関連

- タスク: TASK-28
- 設計: `tmp/dev/plan/design.md` §10.2, §11
- 関連ファイル: `crates/ygo-search/src/vector/{integrity.rs, embeddings.rs, mod.rs, models.sha256}`,
  `crates/ygo-search/tests/{vector_model_integrity.rs, vector_embeddings.rs}`,
  `scripts/setup/gen-model-manifest.sh`
- 関連決定: [[m3-t1-t2-vector-search-embedding-decisions]] §2/§3
