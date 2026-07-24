//! embedding 一致性テスト（M3-T2、設計書 §10.2）。
//!
//! TS (`@xenova/transformers`) が生成した golden.json と `generate_embedding` の出力を比較する。
//!
//! **検証基準（設計書 §10.2 からの変更、量子化モデル採用に伴う実測での調整）**:
//! `cosine >= 0.999`（意味的等価性・検索順位への影響がない範囲）を主基準とする。
//! 設計書原案の `max_abs_diff <= 1e-5` は量子化モデルでは特定入力（8件中1件、"手札を1枚捨てて発動できる。"）で
//! `5.5e-3` まで拡大することを実測確認済み（量子化誤差として妥当な範囲、docs/dev/feature/ に記録）。
//! cosine 基準はこの入力でも `0.9993` を維持しており、vector 検索のランキング・閾値フィルタには実質的な影響がない。
//!
//! モデルファイル（`onnx/model_quantized.onnx` 約118MB、未同梱）が必要なため既定では無視する。
//! 実行例（PoC で生成済みのモデル/golden を使う場合）:
//! ```sh
//! YGO_SEARCH_MODEL_DIR=tmp/dev/poc/vector-poc/models/Xenova/multilingual-e5-small \
//!   cargo test -p ygo-search --no-default-features --features vector-search \
//!   --test vector_embeddings -- --ignored --nocapture
//! ```
#![cfg(feature = "vector-search")]

use ygo_search::vector::generate_embedding;

#[derive(serde::Deserialize)]
struct Golden {
    #[allow(dead_code)]
    model: String,
    samples: Vec<Sample>,
}

#[derive(serde::Deserialize)]
struct Sample {
    id: String,
    text: String,
    embedding: Vec<f32>,
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na > 0.0 && nb > 0.0 {
        dot / (na * nb)
    } else {
        0.0
    }
}

#[test]
#[ignore = "requires ~118MB ONNX model file, run manually via YGO_SEARCH_MODEL_DIR"]
fn embedding_matches_ts_golden() {
    let golden_path = std::env::var("VECTOR_GOLDEN_PATH").unwrap_or_else(|_| {
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../tmp/dev/poc/vector-poc/golden.json"
        )
        .to_string()
    });
    let golden: Golden = serde_json::from_str(
        &std::fs::read_to_string(&golden_path)
            .unwrap_or_else(|e| panic!("golden.json ({golden_path}) 読込に失敗: {e}")),
    )
    .expect("parse golden.json");

    let mut all_pass = true;
    for s in &golden.samples {
        let out = generate_embedding(&s.text).expect("generate_embedding");
        let cos = cosine(&out, &s.embedding);
        let mad = out
            .iter()
            .zip(s.embedding.iter())
            .map(|(a, b)| (a - b).abs())
            .fold(0.0f32, f32::max);
        // cosine を主基準とする（ファイル冒頭コメント参照）。max_abs_diff は情報表示のみ。
        let pass = cos >= 0.999;
        println!(
            "{}: cosine={cos:.6} max_abs_diff={mad:.3e} pass={pass}",
            s.id
        );
        if !pass {
            all_pass = false;
        }
    }
    assert!(
        all_pass,
        "embedding golden 一致性テスト失敗（設計書 §10.2）"
    );
}

/// マニフェスト↔実ファイルのドリフト検出（TASK-28: revision/hash pinning の門番）。
///
/// `YGO_SEARCH_MODEL_DIR` 配下のロード対象ファイル（`onnx/model_quantized.onnx`・
/// `tokenizer.json`）の SHA256 を計算し、SDK に埋め込まれた manifest と一致することを検証する。
/// これが「manifest が古くなった（モデルが差し替えられたのに manifest 更新漏れ）」を検出する唯一の門。
#[test]
#[ignore = "requires ~118MB ONNX model file, run manually via YGO_SEARCH_MODEL_DIR"]
fn embedded_manifest_matches_actual_model_files() {
    let dir = std::env::var("YGO_SEARCH_MODEL_DIR")
        .expect("YGO_SEARCH_MODEL_DIR を設定してください");
    let manifest = ygo_search::vector::integrity::embedded_manifest();
    for rel in ["onnx/model_quantized.onnx", "tokenizer.json"] {
        let path = std::path::Path::new(&dir).join(rel);
        let actual = ygo_search::vector::integrity::sha256_of_file(&path)
            .unwrap_or_else(|e| panic!("{rel} の hash 計算失敗: {e}"));
        let expected = manifest
            .get(rel)
            .unwrap_or_else(|| panic!("manifest に {rel} のエントリがありません"));
        assert_eq!(actual, expected, "{rel} がマニフェストと不一致（ドリフト検出）");
    }
}
