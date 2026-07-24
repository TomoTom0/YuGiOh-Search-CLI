//! embedding 層（M3-T2）。`ort` + `tokenizers` で `Xenova/multilingual-e5-small` を推論する。
//!
//! TS `src/lib/vector/embeddings.ts`（`@xenova/transformers`）の Rust 移植。
//! 設計書 §10.2 の一致条件: mean pooling（attention mask）+ L2 normalize + float32 + E5 prefix なし。
//! モデル/tokenizer はローカルファイルから読込む（offline mode。ダウンロード処理は持たない、設計書 §11）。

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use ndarray::{Array1, Array2};
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;

use super::{integrity, model_dir, VectorError};

/// ort の `Error<R>`（非 `Send` な内部型を持ち得るため）を文字列化して統一エラーに変換する。
fn ort_err<T, R>(r: std::result::Result<T, ort::Error<R>>) -> Result<T, VectorError>
where
    ort::Error<R>: std::fmt::Display,
{
    r.map_err(|e| VectorError::Embed(format!("ort: {e}")))
}

/// モデルファイル名（`<modelDir>` 起点の相対パス）。
///
/// 既定は量子化モデル（`onnx/model_quantized.onnx`）。TS `@xenova/transformers` の
/// 既定推論（quantized）と一致させるため（設計書 §10.2 の golden 一致性検証で確認）。
/// `YGO_SEARCH_MODEL_FILE` で上書き可能（例: 非量子化 `onnx/model.onnx` を使う場合）。
fn model_onnx_path(dir: &Path) -> PathBuf {
    let file = std::env::var("YGO_SEARCH_MODEL_FILE")
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "onnx/model_quantized.onnx".to_string());
    dir.join(file)
}

fn tokenizer_json_path(dir: &Path) -> PathBuf {
    dir.join("tokenizer.json")
}

struct Embedder {
    model: Session,
    tokenizer: tokenizers::Tokenizer,
}

impl Embedder {
    fn new() -> Result<Self, VectorError> {
        let dir = model_dir()?;
        let model_path = model_onnx_path(&dir);
        let tokenizer_path = tokenizer_json_path(&dir);
        if !model_path.is_file() {
            return Err(VectorError::ModelNotFound(model_path));
        }
        if !tokenizer_path.is_file() {
            return Err(VectorError::ModelNotFound(tokenizer_path));
        }

        // モデル整合性検証（TASK-28: revision/hash pinning）。ort/tokenizers のロード前に行い
        // hash 不一致を fail-fast させる（470MB の無駄ロード回避）。OnceLock 初期化時1回のみ。
        integrity::verify_model_files(
            &dir,
            &[&model_path, &tokenizer_path],
            integrity::embedded_manifest(),
        )?;

        let builder = ort_err(Session::builder())?;
        let mut builder = ort_err(builder.with_optimization_level(GraphOptimizationLevel::Level3))?;
        let model = ort_err(builder.commit_from_file(&model_path))?;
        let mut tokenizer = tokenizers::Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| VectorError::Embed(format!("tokenizer load: {e}")))?;
        let _ = tokenizer.with_truncation(Some(tokenizers::TruncationParams {
            max_length: 512,
            ..Default::default()
        }));
        Ok(Self { model, tokenizer })
    }

    /// テキスト → e5-small embedding（mean pooling + L2 normalize、E5 prefix なし）。
    fn embed(&mut self, text: &str) -> Result<Vec<f32>, VectorError> {
        let enc = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| VectorError::Embed(format!("encode: {e}")))?;
        let ids: Vec<i64> = enc.get_ids().iter().map(|&v| v as i64).collect();
        let attn: Vec<i64> = enc.get_attention_mask().iter().map(|&v| v as i64).collect();
        let tt: Vec<i64> = enc.get_type_ids().iter().map(|&v| v as i64).collect();
        let seq = ids.len();

        let to_arr = |v: Vec<i64>| -> Result<Array2<i64>, VectorError> {
            Array2::from_shape_vec((1, seq), v)
                .map_err(|e| VectorError::Embed(format!("tensor shape: {e}")))
        };
        let ids_t = ort_err(ort::value::Tensor::<i64>::from_array(to_arr(ids)?))?;
        let attn_t = ort_err(ort::value::Tensor::<i64>::from_array(to_arr(attn.clone())?))?;
        let tt_t = ort_err(ort::value::Tensor::<i64>::from_array(to_arr(tt)?))?;

        let outputs = ort_err(self.model.run(ort::inputs! {
            "input_ids" => ids_t,
            "attention_mask" => attn_t,
            "token_type_ids" => tt_t,
        }))?;

        let view = ort_err(outputs["last_hidden_state"].try_extract_array::<f32>())?;
        let dim = view.shape()[2];

        let mut pooled = Array1::<f32>::zeros(dim);
        let mut count = 0.0f32;
        for (t, &m) in attn.iter().enumerate() {
            let m = m as f32;
            if m > 0.0 {
                for d in 0..dim {
                    pooled[d] += view[[0usize, t, d]] * m;
                }
                count += m;
            }
        }
        if count > 0.0 {
            pooled.mapv_inplace(|v| v / count);
        }

        let norm = pooled.iter().map(|v| v * v).sum::<f32>().sqrt();
        Ok(if norm > 0.0 {
            pooled.mapv(|v| v / norm).to_vec()
        } else {
            pooled.to_vec()
        })
    }
}

static EMBEDDER: OnceLock<Mutex<Option<Embedder>>> = OnceLock::new();

/// テキストから embedding ベクトルを生成する（TS `generateEmbedding` 相当）。
///
/// 初回呼び出し時にモデル/tokenizer をロードし、以降はプロセス内でキャッシュする
/// （TS `initEmbeddings` のモジュール級シングルトンに相当）。
pub fn generate_embedding(text: &str) -> Result<Vec<f32>, VectorError> {
    let cell = EMBEDDER.get_or_init(|| Mutex::new(None));
    let mut guard = cell
        .lock()
        .map_err(|_| VectorError::Embed("embedder lock poisoned".to_string()))?;
    if guard.is_none() {
        *guard = Some(Embedder::new()?);
    }
    guard.as_mut().expect("just initialized").embed(text)
}

/// バッチ処理の粒度（TS `generateEmbeddings` の `BATCH_SIZE = 32` に一致）。
const EMBEDDING_BATCH_SIZE: usize = 32;

/// 複数テキストから embedding を一括生成する（TS `generateEmbeddings` 相当）。
///
/// BATCH_SIZE(32) 単位でチャンク区切り、進捗を stderr に出力する（TS と同じフォーマット）。
///
/// **実装方針（設計判断）**: 内部では golden 検証済みの [`generate_embedding`]（1件推論）を
/// 順次呼び出す。transformer の mean pooling は系列独立（attention mask で他系列の影響を受けない）
/// ため、この結果は TS の融合バッチ推論（`model(batch, ...)`）と数学的に完全一致する。
/// 融合バッチは性能最適化として将来候補だが、バッチ固有の誤差が `cosine >= 0.999` の背後に隠れうる
/// リスクを避け、index 構築（オフライン・一回限り）では正確性を優先する。
pub fn generate_embeddings(texts: &[&str]) -> Result<Vec<Vec<f32>>, VectorError> {
    let total = texts.len();
    let mut out = Vec::with_capacity(total);
    let mut i = 0;
    while i < total {
        let end = (i + EMBEDDING_BATCH_SIZE).min(total);
        for text in &texts[i..end] {
            out.push(generate_embedding(text)?);
        }
        eprintln!("Embeddingを生成中: {}/{}", end, total);
        i = end;
    }
    Ok(out)
}
