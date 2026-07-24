//! integrity オーケストレーション（`verify_model_files`）の env 依存テスト（TASK-28）。
//!
//! `YGO_SEARCH_SKIP_MODEL_VERIFY` / `YGO_SEARCH_STRICT_MODEL_VERIFY` を触るため
//! process-global な `SERIAL` Mutex で直列化する（`vector_indexer.rs` と同じパターン）。
//! 純粋関数（parse/relpath/sha256/verify_file/embedded manifest 健全性）は `integrity.rs` 内の
//! unit test でカバー済み。
#![cfg(feature = "vector-search")]

use std::sync::Mutex;

use tempfile::tempdir;
use ygo_search::vector::integrity::{sha256_of_file, verify_model_files, ModelManifest};
use ygo_search::vector::{generate_embedding, VectorError};

/// env を触るテストの直列化ガード（env は process-global）。
static SERIAL: Mutex<()> = Mutex::new(());

/// 設定した env var を Drop で確実に解除するガード（panic 時も cleanup）。
struct EnvGuard(&'static str);
impl Drop for EnvGuard {
    fn drop(&mut self) {
        std::env::remove_var(self.0);
    }
}
fn set_env(name: &'static str, val: &str) -> EnvGuard {
    std::env::set_var(name, val);
    EnvGuard(name)
}

/// `dir/<rel>` に content を書き、その SHA256 を返す。
fn write_and_hash(dir: &std::path::Path, rel: &str, content: &[u8]) -> String {
    let p = dir.join(rel);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).expect("mkdir");
    }
    std::fs::write(&p, content).expect("write");
    sha256_of_file(&p).expect("hash")
}

#[test]
fn orchestration_match_passes_all() {
    let _g = SERIAL.lock().unwrap();
    let dir = tempdir().expect("tempdir");
    let h1 = write_and_hash(dir.path(), "onnx/model_quantized.onnx", b"model-bytes");
    let h2 = write_and_hash(dir.path(), "tokenizer.json", b"tok-bytes");
    let m = ModelManifest::parse(&format!(
        "{h1}  onnx/model_quantized.onnx\n{h2}  tokenizer.json\n"
    ))
    .expect("parse");
    let mpath = dir.path().join("onnx/model_quantized.onnx");
    let tpath = dir.path().join("tokenizer.json");
    verify_model_files(dir.path(), &[&mpath, &tpath], &m).expect("match -> Ok");
}

#[test]
fn orchestration_mismatch_in_second_file_errors() {
    let _g = SERIAL.lock().unwrap();
    let dir = tempdir().expect("tempdir");
    let h1 = write_and_hash(dir.path(), "onnx/model_quantized.onnx", b"model-bytes");
    write_and_hash(dir.path(), "tokenizer.json", b"tok-bytes");
    let wrong = "0".repeat(64);
    let m = ModelManifest::parse(&format!(
        "{h1}  onnx/model_quantized.onnx\n{wrong}  tokenizer.json\n"
    ))
    .expect("parse");
    let mpath = dir.path().join("onnx/model_quantized.onnx");
    let tpath = dir.path().join("tokenizer.json");
    let err = verify_model_files(dir.path(), &[&mpath, &tpath], &m).unwrap_err();
    assert!(
        matches!(err, VectorError::ModelIntegrity { .. }),
        "expected ModelIntegrity, got {err:?}"
    );
}

#[test]
fn orchestration_default_unknown_relpath_warns_and_ok() {
    let _g = SERIAL.lock().unwrap();
    let dir = tempdir().expect("tempdir");
    write_and_hash(dir.path(), "custom.onnx", b"x");
    let m = ModelManifest::parse("# empty manifest\n").expect("parse");
    let p = dir.path().join("custom.onnx");
    verify_model_files(dir.path(), &[&p], &m).expect("unknown relpath -> warn+skip");
}

#[test]
fn orchestration_strict_unknown_relpath_errors() {
    let _g = SERIAL.lock().unwrap();
    let _strict = set_env("YGO_SEARCH_STRICT_MODEL_VERIFY", "1");
    let dir = tempdir().expect("tempdir");
    write_and_hash(dir.path(), "custom.onnx", b"x");
    let m = ModelManifest::parse("# empty manifest\n").expect("parse");
    let p = dir.path().join("custom.onnx");
    let err = verify_model_files(dir.path(), &[&p], &m).unwrap_err();
    assert!(
        matches!(err, VectorError::UnverifiableModelPath(_)),
        "expected UnverifiableModelPath, got {err:?}"
    );
}

#[test]
fn orchestration_strict_absolute_override_errors() {
    let _g = SERIAL.lock().unwrap();
    let _strict = set_env("YGO_SEARCH_STRICT_MODEL_VERIFY", "1");
    let dir = tempdir().expect("tempdir");
    // model_dir とは別の場所にある絶対パス（relpath 計算不能）。
    let abs = dir.path().join("rogue.onnx");
    std::fs::write(&abs, b"x").expect("write");
    let model_dir = dir.path().join("models").join("e5");
    let m = ModelManifest::parse("# empty manifest\n").expect("parse");
    let err = verify_model_files(&model_dir, &[&abs], &m).unwrap_err();
    assert!(
        matches!(err, VectorError::UnverifiableModelPath(_)),
        "expected UnverifiableModelPath, got {err:?}"
    );
}

#[test]
fn orchestration_skip_bypasses_mismatch() {
    let _g = SERIAL.lock().unwrap();
    let _skip = set_env("YGO_SEARCH_SKIP_MODEL_VERIFY", "1");
    let dir = tempdir().expect("tempdir");
    write_and_hash(dir.path(), "onnx/model_quantized.onnx", b"real-content");
    let wrong = "0".repeat(64);
    let m = ModelManifest::parse(&format!("{wrong}  onnx/model_quantized.onnx\n")).expect("parse");
    let p = dir.path().join("onnx/model_quantized.onnx");
    verify_model_files(dir.path(), &[&p], &m).expect("skip bypasses mismatch");
}

#[test]
fn orchestration_skip_overrides_strict() {
    let _g = SERIAL.lock().unwrap();
    let _skip = set_env("YGO_SEARCH_SKIP_MODEL_VERIFY", "1");
    let _strict = set_env("YGO_SEARCH_STRICT_MODEL_VERIFY", "1");
    let dir = tempdir().expect("tempdir");
    write_and_hash(dir.path(), "custom.onnx", b"x");
    let m = ModelManifest::parse("# empty manifest\n").expect("parse");
    let p = dir.path().join("custom.onnx");
    verify_model_files(dir.path(), &[&p], &m).expect("skip wins over strict");
}

/// `Embedder::new()` の検証フックが実際に発火することを、本物モデルを使わずに検証する
/// （CI で回帰検出可能）。ダミーファイルは埋め込み manifest の hash と一致しないため
/// `generate_embedding` のエントリポイントから `ModelIntegrity` が返る。
#[test]
fn embedding_entry_point_rejects_tampered_model_via_hook() {
    let _g = SERIAL.lock().unwrap();
    let dir = tempdir().expect("tempdir");
    // 既定のロード対象パス（onnx/model_quantized.onnx・tokenizer.json）にダミーを配置。
    // 内容は manifest と一致しない → verify_model_files が ModelIntegrity を返す。
    std::fs::create_dir_all(dir.path().join("onnx")).expect("mkdir onnx");
    std::fs::write(dir.path().join("onnx").join("model_quantized.onnx"), b"tampered-content")
        .expect("write onnx");
    std::fs::write(dir.path().join("tokenizer.json"), b"tampered-content").expect("write tok");
    let _model_dir = set_env(
        "YGO_SEARCH_MODEL_DIR",
        dir.path().to_str().expect("utf8 path"),
    );
    let err = generate_embedding("any text").unwrap_err();
    assert!(
        matches!(err, VectorError::ModelIntegrity { .. }),
        "Embedder::new の検証フックが発火せず、別のエラーが返りました: {err:?}"
    );
}
