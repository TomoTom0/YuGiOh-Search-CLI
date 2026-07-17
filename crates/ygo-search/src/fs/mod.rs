//! fs feature: TSV 読込・ファイル IO・モジュール級キャッシュ（Layer B-fs）。
//!
//! TS `src/utils/faq-loader.ts` / `src/lib/config/paths.ts` の Rust 移植。
//! native-only（wasm32 では `compile_error!`）。

use std::path::{Path, PathBuf};

pub mod cache;
pub mod filter;
#[cfg(all(feature = "fs", feature = "format"))]
pub mod format_io;
pub mod jsonl;
pub mod pipeline;
pub mod search;
pub mod seek;
pub mod tsv;

pub use cache::clear_cache;
#[cfg(all(feature = "fs", feature = "format"))]
pub use format_io::{convert_format_file, parse_format_file};
#[cfg(feature = "format")]
pub use jsonl::convert_generic_to_jsonl;
pub use jsonl::{convert_cards_to_jsonl, convert_faqs_to_jsonl};
pub use pipeline::{extract_and_search_cards, extract_card_patterns, judge_and_replace};
pub use search::{extract_card_references, get_cards_by_ids, load_faq_index, search_cards, search_faq};
pub use seek::seek_cards;
pub use tsv::{load_card_details, load_cards, load_faqs, read_tsv_table, TsvTable};

/// fs feature のエラー型。
#[derive(Debug, thiserror::Error)]
pub enum FsError {
    /// データファイルが存在しない（データ未ダウンロード）。
    #[error(
        "データファイルが見つかりません: {0}\n\n以下のコマンドでデータをダウンロードしてください:\n  ygo_update_search"
    )]
    FileNotFound(String),
    /// TSV パース失敗。
    #[error("TSV パースに失敗しました ({file}): {source}")]
    Parse {
        file: &'static str,
        #[source]
        source: csv::Error,
    },
    /// ホームディレクトリを解決できなかった。
    #[error("ホームディレクトリを解決できません")]
    HomeDirUnavailable,
    /// IO エラー。
    #[error("IO エラー: {0}")]
    Io(#[from] std::io::Error),
    /// JSON シリアライズ/パース失敗（jsonl 変換等）。
    #[error("JSON エラー: {0}")]
    Json(#[from] serde_json::Error),
    /// YAML パース失敗（generic jsonl 変換の yaml 入力）。
    #[cfg(feature = "format")]
    #[error("YAML エラー: {0}")]
    Yaml(#[from] serde_yaml::Error),
    /// オプション指定が不正（TS `throw new Error(...)` 相当）。
    #[error("{0}")]
    InvalidOption(String),
}

/// 純粋なワークディレクトリ解決（テスト用に env/home を外部注入）。
///
/// TS `paths.ts` `getWorkDir` 互換:
/// - env 先頭 `~/` → `<home>/<env[2..]>`
/// - env 絶対パス → そのまま
/// - env 相対パス → `<cwd>/<env>`（TS `path.resolve` 互換）
/// - env なし/空 → `<home>/.local/ygo-search`
pub fn resolve_workdir(env_val: Option<&str>, home: &Path) -> PathBuf {
    match env_val.filter(|v| !v.is_empty()) {
        Some(v) => {
            if let Some(rest) = v.strip_prefix("~/") {
                home.join(rest)
            } else {
                let p = PathBuf::from(v);
                if p.is_absolute() {
                    p
                } else {
                    // 相対パスは cwd 結合（TS path.resolve 互換）
                    std::env::current_dir()
                        .unwrap_or_default()
                        .join(p)
                }
            }
        }
        None => home.join(".local").join("ygo-search"),
    }
}

/// ワークディレクトリを解決する（TS `getWorkDir` 相当）。
///
/// 優先順位: 環境変数 `YGO_SEARCH_WORKDIR` → デフォルト `~/.local/ygo-search/`。
/// ※ development-plan.md M2-T1 の名称 `find_project_root` に合わせるが、
///    意味論は workdir 解決。
pub fn find_project_root() -> Result<PathBuf, FsError> {
    let home = dirs::home_dir().ok_or(FsError::HomeDirUnavailable)?;
    let env_val = std::env::var("YGO_SEARCH_WORKDIR").ok();
    Ok(resolve_workdir(env_val.as_deref(), &home))
}

/// データディレクトリ `<workdir>/data`（TS `getDataDir` 相当）。
pub fn data_dir() -> Result<PathBuf, FsError> {
    Ok(find_project_root()?.join("data"))
}

/// TSV ファイルパス `<workdir>/data/tsv/<filename>`（TS `getTsvPath` 相当）。
pub fn tsv_path(filename: &str) -> Result<PathBuf, FsError> {
    Ok(data_dir()?.join("tsv").join(filename))
}
