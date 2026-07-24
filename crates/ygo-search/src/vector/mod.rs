//! vector feature: LanceDB 接続・vector 検索・embedding 推論（Layer C）。
//!
//! TS `src/lib/vector/{searcher,embeddings}.ts` の Rust 移植。native-only（wasm32 では `compile_error!`）。

use std::path::PathBuf;
use std::sync::OnceLock;

use lancedb::Connection;

pub mod embeddings;
pub mod indexer;
pub mod searcher;

pub use embeddings::{generate_embedding, generate_embeddings};
pub use indexer::{create_index, index_from_jsonl};
pub use searcher::{
    list_tables, search_table, vector_search_all, vector_search_cards, vector_search_faqs,
};

/// vector feature のエラー型。
#[derive(Debug, thiserror::Error)]
pub enum VectorError {
    /// ホームディレクトリを解決できなかった（TS `getWorkDir` 相当の前提条件）。
    #[error("ホームディレクトリを解決できません")]
    HomeDirUnavailable,
    /// LanceDB 接続失敗。
    #[error("LanceDB 接続に失敗しました ({uri}): {message}")]
    Connect { uri: String, message: String },
    /// テーブルオープン失敗（テーブル未作成等）。
    #[error("テーブル '{table}' のオープンに失敗しました: {message}")]
    OpenTable { table: String, message: String },
    /// テーブル一覧取得失敗。
    #[error("テーブル一覧の取得に失敗しました: {0}")]
    ListTables(String),
    /// vector 検索クエリ失敗。
    #[error("テーブル '{table}' の検索に失敗しました: {message}")]
    Query { table: String, message: String },
    /// 検索結果デコード失敗（Arrow → JSON 変換）。
    #[error("検索結果のデコードに失敗しました: {0}")]
    Decode(String),
    /// `filter`/`exclude` に許可されていないキーが指定された（where 式 whitelist、設計書 §11）。
    #[error("フィルタキー '{0}' は許可されていません")]
    InvalidFilterKey(String),
    /// オプション値が不正（例: 数値であるべき exclude.faqIds に非数値文字列）。
    #[error("{0}")]
    InvalidOption(String),
    /// embedding モデル/tokenizer ファイルが見つからない。
    #[error(
        "embedding モデルが見つかりません: {0}\n\n配置場所: <workDir>/models/Xenova/multilingual-e5-small/ (onnx/model.onnx, tokenizer.json)\nまたは環境変数 YGO_SEARCH_MODEL_DIR で配置ディレクトリを指定してください。"
    )]
    ModelNotFound(PathBuf),
    /// embedding 生成失敗（tokenizer/ort 推論エラー）。
    #[error("embedding 生成に失敗しました: {0}")]
    Embed(String),
    /// index 構築失敗（空入力・ベクトル次元不整合・create_table 失敗等）。
    #[error("インデックス構築に失敗しました: {message}")]
    IndexBuild { message: String },
    /// JSONL 1 行のパース失敗（`{line}` 行目）。
    #[error("JSONL {line} 行目のパースに失敗しました: {message}")]
    ParseRecord { line: usize, message: String },
    /// IO エラー。
    #[error("IO エラー: {0}")]
    Io(#[from] std::io::Error),
}

/// 純粋なワークディレクトリ解決（`fs::resolve_workdir` と同一ロジック）。
///
/// vector-search feature は fs feature 非依存で成立しうるため（設計書 §5 feature 分離）、
/// ここで独立して解決する（`fs` モジュールが常に有効とは限らない）。
fn resolve_workdir(env_val: Option<&str>, home: &std::path::Path) -> PathBuf {
    match env_val.filter(|v| !v.is_empty()) {
        Some(v) => {
            if let Some(rest) = v.strip_prefix("~/") {
                home.join(rest)
            } else {
                let p = PathBuf::from(v);
                if p.is_absolute() {
                    p
                } else {
                    std::env::current_dir().unwrap_or_default().join(p)
                }
            }
        }
        None => home.join(".local").join("ygo-search"),
    }
}

fn workdir() -> Result<PathBuf, VectorError> {
    let home = dirs::home_dir().ok_or(VectorError::HomeDirUnavailable)?;
    let env_val = std::env::var("YGO_SEARCH_WORKDIR").ok();
    Ok(resolve_workdir(env_val.as_deref(), &home))
}

/// Vector DB ディレクトリ `<workDir>/data/vector`（TS `getVectorDbPath` 相当）。
pub fn vector_db_dir() -> Result<PathBuf, VectorError> {
    Ok(workdir()?.join("data").join("vector"))
}

/// vector feature 共有の tokio runtime（searcher・indexer で利用）。
///
/// LanceDB の非同期 API を同期的に呼ぶためのプロセス単一 runtime。native-only。
fn runtime() -> &'static tokio::runtime::Runtime {
    static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RT.get_or_init(|| tokio::runtime::Runtime::new().expect("tokio runtime 初期化に失敗しました"))
}

/// LanceDB へ接続する（DB ディレクトリが無ければ作成）。searcher・indexer 共有。
async fn connect_db() -> Result<Connection, VectorError> {
    let dir = vector_db_dir()?;
    std::fs::create_dir_all(&dir)?;
    let uri = dir.to_string_lossy().to_string();
    lancedb::connect(&uri)
        .execute()
        .await
        .map_err(|e| VectorError::Connect {
            uri,
            message: e.to_string(),
        })
}

/// embedding モデル配置ディレクトリ。
///
/// 環境変数 `YGO_SEARCH_MODEL_DIR` で上書き可能（テスト・オフライン運用向け）。
/// 既定値: `<workDir>/models/Xenova/multilingual-e5-small`（TS 側に対応する概念はなく、
/// Rust 側の embedding 推論用にモデルファイルをローカル配置するための新設パス、設計書 §10.2 offline mode）。
pub fn model_dir() -> Result<PathBuf, VectorError> {
    if let Ok(dir) = std::env::var("YGO_SEARCH_MODEL_DIR") {
        if !dir.is_empty() {
            return Ok(PathBuf::from(dir));
        }
    }
    Ok(workdir()?
        .join("models")
        .join("Xenova")
        .join("multilingual-e5-small"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_workdir_env_tilde() {
        let home = PathBuf::from("/home/u");
        assert_eq!(
            resolve_workdir(Some("~/custom"), &home),
            PathBuf::from("/home/u/custom")
        );
    }

    #[test]
    fn resolve_workdir_default() {
        let home = PathBuf::from("/home/u");
        assert_eq!(
            resolve_workdir(None, &home),
            PathBuf::from("/home/u/.local/ygo-search")
        );
    }

    #[test]
    fn resolve_workdir_absolute() {
        let home = PathBuf::from("/home/u");
        assert_eq!(
            resolve_workdir(Some("/abs/path"), &home),
            PathBuf::from("/abs/path")
        );
    }
}
