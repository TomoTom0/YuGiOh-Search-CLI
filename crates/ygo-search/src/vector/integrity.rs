//! モデル整合性検証（TASK-28: revision/hash pinning）。設計書 §10.2/§11。
//!
//! 期待ハッシュ表（`models.sha256`）を [`include_str!`] でバイナリに埋め込み、ロード時に
//! 実ファイルの SHA256 を照合する。マニフェストをモデル隣接ではなく **バイナリ埋め込み** する
//! ことで、モデルが別 revision で再取得（上書き）されても検出できる（accidental revision overwrite
//! 脅威モデル。adversarial in-process TOCTOU は scope 外）。
//!
//! 検証の既定は緩い（マニフェストに対象エントリがあれば検証・なければ警告して skip）。
//! 厳格化は `YGO_SEARCH_STRICT_MODEL_VERIFY=1`（エントリ無/relpath 計算不能 → エラー）。
//! バイパスは `YGO_SEARCH_SKIP_MODEL_VERIFY=1`（**SKIP は STRICT より優先**・緊急脱出）。

use std::collections::HashMap;
use std::path::Path;

use sha2::{Digest, Sha256};

use super::VectorError;

/// マニフェストの parse エラー（コミット済み `models.sha256` のみが対象・外部 API に出さない想定だが
/// テストで変種を区別するため [`pub`]）。
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ManifestParseError {
    /// hash が64文字（256bit）未満。
    #[error("マニフェストの hash が64文字ではありません")]
    InvalidHashLen,
    /// hash に16進以外の文字が含まれる。
    #[error("マニフェストの hash に16進以外の文字が含まれます")]
    InvalidHex,
    /// path が空・空白・バックスラッシュ区切り等で不正。
    #[error("マニフェストの path が不正です")]
    InvalidPath,
}

/// 埋め込みマニフェストの parse 表現。`relpath -> 64文字 lowercase hex` の写像と revision。
#[derive(Debug)]
pub struct ModelManifest {
    entries: HashMap<String, String>,
    revision: Option<String>,
}

impl ModelManifest {
    /// マニフェストテキストを parse する（純粋）。
    ///
    /// 行形式: `# <comment>`（`# revision: <rev>` のみ抽出）/ 空行は skip /
    /// `<64hex>{空白または *}<posix-relpath>`。hash は小文字正規化して格納。
    pub fn parse(text: &str) -> Result<Self, ManifestParseError> {
        let mut entries: HashMap<String, String> = HashMap::new();
        let mut revision: Option<String> = None;
        for raw in text.lines() {
            let line = raw.trim_end();
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Some(comment_body) = trimmed.strip_prefix('#') {
                let body = comment_body.trim_start();
                if let Some(rev) = body.strip_prefix("revision:") {
                    let rev = rev.trim();
                    if !rev.is_empty() {
                        revision = Some(rev.to_string());
                    }
                }
                continue;
            }

            // エントリ行: 先頭64文字が hash。
            let bytes = line.as_bytes();
            if bytes.len() < 64 {
                return Err(ManifestParseError::InvalidHashLen);
            }
            let hash_part = &line[..64];
            if !hash_part.bytes().all(|b| b.is_ascii_hexdigit()) {
                return Err(ManifestParseError::InvalidHex);
            }
            let rest = line[64..].trim_start();
            // sha256sum -b の binary mode marker `*` を許容。
            let path_str = rest.strip_prefix('*').unwrap_or(rest);
            let path_str = path_str.trim();
            if path_str.is_empty()
                || path_str.contains('\\')
                || path_str.contains(char::is_whitespace)
            {
                return Err(ManifestParseError::InvalidPath);
            }
            entries.insert(path_str.to_string(), hash_part.to_ascii_lowercase());
        }
        Ok(Self { entries, revision })
    }

    /// `relpath`（POSIX 区切り）に対応する期待 hash を返す。
    pub fn get(&self, relpath: &str) -> Option<&str> {
        self.entries.get(relpath).map(String::as_str)
    }

    /// エントリ数（テスト用）。
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// エントリが空か（`len()` との対・clippy）。
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// revision（HF commit SHA・informational）。テスト用に公開。
    pub fn revision(&self) -> Option<&str> {
        self.revision.as_deref()
    }

    /// `relpath` がエントリに含まれるか（テスト用）。
    pub fn contains(&self, relpath: &str) -> bool {
        self.entries.contains_key(relpath)
    }
}

/// `model_dir` 配下の `abs_path` の POSIX relpath を返す。絶対パス・`..`・model_dir 外・
/// model_dir 自体（空 relpath）は `None`。`canonicalize` しない（IO 発生・ファイル不在時の失敗を避ける）。
pub fn relpath_under(model_dir: &Path, abs_path: &Path) -> Option<String> {
    let rel = abs_path.strip_prefix(model_dir).ok()?;
    if rel.as_os_str().is_empty() {
        return None;
    }
    let mut parts: Vec<&str> = Vec::new();
    for comp in rel.components() {
        match comp {
            std::path::Component::Normal(s) => {
                let s = s.to_str()?;
                if s.is_empty() || s.contains('\\') || s.contains(char::is_whitespace) {
                    return None;
                }
                parts.push(s);
            }
            // CurDir/ParentDir/RootDir/Prefix は全て拒否（`../` bypass 防御・strict で refuse される）。
            _ => return None,
        }
    }
    Some(parts.join("/"))
}

/// ファイルの SHA256 を計算して lowercase hex 文字列で返す（streaming・64KB buffer・470MB 対応）。
pub fn sha256_of_file(path: &Path) -> Result<String, std::io::Error> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        Digest::update(&mut hasher, &buf[..n]);
    }
    let digest = Digest::finalize(hasher);
    Ok(hex_lower(&digest))
}

/// `expected_hex`（lowercase 比較）と実ファイルの SHA256 が一致するか検証する。
pub fn verify_file(path: &Path, expected_hex: &str) -> Result<(), VectorError> {
    let actual = sha256_of_file(path).map_err(VectorError::Io)?;
    let expected = expected_hex.to_ascii_lowercase();
    if actual == expected {
        Ok(())
    } else {
        Err(VectorError::ModelIntegrity {
            path: path.to_path_buf(),
            expected,
            actual,
        })
    }
}

fn env_flag(name: &str) -> bool {
    matches!(
        std::env::var(name).ok().as_deref(),
        Some("1" | "true" | "TRUE" | "True")
    )
}

/// `YGO_SEARCH_SKIP_MODEL_VERIFY=1`（緊急脱出・STRICT より優先）。
fn skip_verify() -> bool {
    env_flag("YGO_SEARCH_SKIP_MODEL_VERIFY")
}

/// `YGO_SEARCH_STRICT_MODEL_VERIFY=1`（エントリ無/relpath 計算不能 → エラー）。
fn strict_verify() -> bool {
    env_flag("YGO_SEARCH_STRICT_MODEL_VERIFY")
}

/// ロード対象ファイル群をマニフェストに対して検証する。`Embedder::new()` から呼ばれる。
///
/// skip=1 → 即 `Ok`。各 `path` について:
/// - `relpath_under` → `Some(rel)` かつマニフェストにエントリ有 → `verify_file`
/// - エントリ無、または relpath 計算不能 → strict なら `Err`、否则 warn+skip
pub fn verify_model_files(
    model_dir: &Path,
    paths: &[&Path],
    manifest: &ModelManifest,
) -> Result<(), VectorError> {
    if skip_verify() {
        return Ok(());
    }
    let strict = strict_verify();
    for path in paths {
        match relpath_under(model_dir, path) {
            Some(rel) => match manifest.get(&rel) {
                Some(expected) => verify_file(path, expected)?,
                None => {
                    if strict {
                        return Err(VectorError::UnverifiableModelPath(path.to_path_buf()));
                    }
                    eprintln!(
                        "モデル整合性検証: マニフェストに '{rel}' のエントリが無いためスキップします"
                    );
                }
            },
            None => {
                if strict {
                    return Err(VectorError::UnverifiableModelPath(path.to_path_buf()));
                }
                eprintln!(
                    "モデル整合性検証: {} は model_dir 配下でないためスキップします",
                    path.display()
                );
            }
        }
    }
    Ok(())
}

/// 埋め込みマニフェスト（`include_str!("models.sha256"`）。コミット済み不変条件のため
/// parse 失敗は panic（ビルド時不変）。
pub fn embedded_manifest() -> &'static ModelManifest {
    static MANIFEST: std::sync::OnceLock<ModelManifest> = std::sync::OnceLock::new();
    MANIFEST.get_or_init(|| {
        ModelManifest::parse(include_str!("models.sha256"))
            .expect("埋め込み models.sha256 の parse に失敗（ビルド時不変条件）")
    })
}

/// バイト列を lowercase hex 文字列へ（`format!("{:x}", GenericArray)` が Debug 実装依存で
/// 安定しないため、byte ごとに `{:02x}` で構築）。
fn hex_lower(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(out, "{b:02x}");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_HASH: &str = "f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193";

    #[test]
    fn parse_valid_three_entries_and_revision() {
        let text = format!(
            "# model: x\n# revision: abc123\n{VALID_HASH}  onnx/model_quantized.onnx\n{VALID_HASH}  tokenizer.json\n{VALID_HASH}  onnx/model.onnx\n"
        );
        let m = ModelManifest::parse(&text).expect("parse");
        assert_eq!(m.len(), 3);
        assert_eq!(m.revision(), Some("abc123"));
        assert!(m.contains("onnx/model_quantized.onnx"));
        assert!(m.contains("tokenizer.json"));
        assert!(m.contains("onnx/model.onnx"));
    }

    #[test]
    fn parse_skips_blank_and_comment_lines() {
        let text = format!("\n   \n# comment\n{VALID_HASH}  onnx/model.onnx\n");
        let m = ModelManifest::parse(&text).expect("parse");
        assert_eq!(m.len(), 1);
        assert_eq!(m.revision(), None);
    }

    #[test]
    fn parse_accepts_binary_mode_asterisk() {
        let text = format!("{VALID_HASH} *onnx/model.onnx\n");
        let m = ModelManifest::parse(&text).expect("parse");
        assert!(m.contains("onnx/model.onnx"));
        assert_eq!(m.get("onnx/model.onnx"), Some(VALID_HASH));
    }

    #[test]
    fn parse_rejects_short_hash() {
        let text = "abc123  onnx/model.onnx\n";
        assert!(matches!(
            ModelManifest::parse(text),
            Err(ManifestParseError::InvalidHashLen)
        ));
    }

    #[test]
    fn parse_rejects_non_hex_hash() {
        let bad = "g".repeat(64);
        let text = format!("{bad}  onnx/model.onnx\n");
        assert!(matches!(
            ModelManifest::parse(&text),
            Err(ManifestParseError::InvalidHex)
        ));
    }

    #[test]
    fn parse_rejects_empty_path() {
        let text = format!("{VALID_HASH}  \n");
        assert!(matches!(
            ModelManifest::parse(&text),
            Err(ManifestParseError::InvalidPath)
        ));
    }

    #[test]
    fn parse_rejects_backslash_path() {
        let text = format!("{VALID_HASH}  onnx\\model.onnx\n");
        assert!(matches!(
            ModelManifest::parse(&text),
            Err(ManifestParseError::InvalidPath)
        ));
    }

    #[test]
    fn parse_normalizes_uppercase_hex() {
        let upper = "F80102D3F2A1229F387D3C81909990D8945513E347B0EAB049F7DE3C6F98C193";
        let text = format!("{upper}  onnx/model.onnx\n");
        let m = ModelManifest::parse(&text).expect("parse");
        assert_eq!(m.get("onnx/model.onnx"), Some(VALID_HASH));
    }

    #[test]
    fn relpath_under_quantized_default() {
        let dir = Path::new("/work/models/e5");
        let p = dir.join("onnx").join("model_quantized.onnx");
        assert_eq!(relpath_under(dir, &p).as_deref(), Some("onnx/model_quantized.onnx"));
    }

    #[test]
    fn relpath_under_tokenizer() {
        let dir = Path::new("/work/models/e5");
        let p = dir.join("tokenizer.json");
        assert_eq!(relpath_under(dir, &p).as_deref(), Some("tokenizer.json"));
    }

    #[test]
    fn relpath_under_absolute_override_returns_none() {
        let dir = Path::new("/work/models/e5");
        let p = Path::new("/tmp/rogue.onnx");
        assert_eq!(relpath_under(dir, p), None);
    }

    #[test]
    fn relpath_under_parent_dir_returns_none() {
        let dir = Path::new("/work/models/e5");
        let p = dir.join("..").join("x.onnx");
        assert_eq!(relpath_under(dir, &p), None);
    }

    #[test]
    fn relpath_under_model_dir_itself_returns_none() {
        let dir = Path::new("/work/models/e5");
        assert_eq!(relpath_under(dir, dir), None);
    }

    #[test]
    fn sha256_of_file_nist_abc_vector() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let p = tmp.path().join("abc");
        std::fs::write(&p, b"abc").expect("write");
        assert_eq!(
            sha256_of_file(&p).expect("hash"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn sha256_of_file_empty() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let p = tmp.path().join("empty");
        std::fs::write(&p, b"").expect("write");
        assert_eq!(
            sha256_of_file(&p).expect("hash"),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn verify_file_match_ok() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let p = tmp.path().join("abc");
        std::fs::write(&p, b"abc").expect("write");
        let expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        verify_file(&p, expected).expect("match");
    }

    #[test]
    fn verify_file_mismatch_returns_model_integrity() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let p = tmp.path().join("abc");
        std::fs::write(&p, b"abc").expect("write");
        let wrong = "0".repeat(64);
        let err = verify_file(&p, &wrong).unwrap_err();
        match err {
            VectorError::ModelIntegrity { path, expected, actual } => {
                assert_eq!(path, p);
                assert_eq!(expected, wrong);
                assert_eq!(
                    actual,
                    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
                );
            }
            other => panic!("expected ModelIntegrity, got {other:?}"),
        }
    }

    #[test]
    fn verify_file_case_insensitive_compare() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let p = tmp.path().join("abc");
        std::fs::write(&p, b"abc").expect("write");
        let upper = "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD";
        verify_file(&p, upper).expect("case-insensitive match");
    }

    #[test]
    fn embedded_manifest_parses_and_has_required_entries() {
        let m = embedded_manifest();
        for key in ["onnx/model_quantized.onnx", "onnx/model.onnx", "tokenizer.json"] {
            let h = m.get(key).unwrap_or_else(|| panic!("missing entry {key}"));
            assert_eq!(h.len(), 64, "entry {key} hash not 64 hex chars");
            assert!(h.bytes().all(|b| b.is_ascii_hexdigit()), "entry {key} not hex");
        }
        assert!(m.revision().is_some(), "revision 未記録");
    }
}
