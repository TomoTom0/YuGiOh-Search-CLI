# format feature の YAML クレート（serde_yaml 非推奨）と設計書乖離

## 現状
TASK-10 [M1-T3] で `format` feature（JSON/JSONL/JSONC/YAML 変換）を実装。
YAML パース/ダンプに `serde_yaml 0.9`（非推奨）を使用。JSONC に `jsonc-parser`（`serde` feature）、タイムスタンプに `chrono` を採用。

## 問題点
1. **serde_yaml 0.9 非推奨**: 2024-03 に dtolnay が保守終了。後継の `serde-saphyr` は alpha（1.0 未）で、TS `js-yaml` とのシリアライズ差が未知。TASK-10 の核心要件「TS同等性（golden test 厳密一致）」を優先し、実績のある serde_yaml を採用した。
2. **設計書との乖離**:
   - `design.md` L121 は `format = ["dep:serde_json", "dep:serde_yaml"]` を想定（serde_json を feature 配下）。実装では `serde_json` は常時依存（`types/options.rs` の `filter`/`card_filter` が無条件で `serde_json::Value` を使用）。実装は `format = ["dep:serde_yaml", "dep:jsonc-parser", "dep:chrono", "dep:thiserror"]`。
   - `design.md` L330 は「JSONC は serde_json の寛容パースまたは専用クレート（M1-T2 で選定）」。実際は M1-T3 で `jsonc-parser`（`parse_to_serde_value`）専用クレートに選定した。

## 改善案
- `serde-saphyr` が安定化（1.0 リリース）したら乗せ替える。format feature 内に閉じているため影響範囲は限定。
- 設計書（`tmp/dev/plan/design.md` §5 L110/L121, §9.2 L330）の serde_yaml / serde_json / JSONC 記述を実装の実態に合わせて更新する。

## 優先度
low（format feature は optional・default ビルドに影響しない・YAML 動作は安定・golden test 通過済み）

## 関連
- TASK: TASK-10 [M1-T3]
- 関連ファイル: `crates/ygo-search/src/format/mod.rs`, `crates/ygo-search/Cargo.toml`
- 設計: `tmp/dev/plan/design.md` §5（L110, L121）, §9.2（L330）
