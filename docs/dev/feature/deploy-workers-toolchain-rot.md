# Workers デプロイパイプラインのツールチェーン腐敗

## 現状

`crates/ygo-search-workers`（Cloudflare Workers adapter）のコードは `worker = "0.4"` 依存。コード自体は `cargo build --target wasm32-unknown-unknown` でコンパイル可能（`ygo_search_workers.wasm` 生成確認済み）。しかし **`wrangler deploy`（worker-build 経由のパッケージング）が現在のツールチェーンで失敗** する。

TASK-5（M0-T1 workspace 移行）の検証で、`wrangler deploy --dry-run` を走らせて初めて顕在化した（移行前は `#[cfg(feature="workers")]` ゲート + デプロイ未検証で隠れていた）。

## 問題点

worker 0.4 系と現在の worker-build / wasm-bindgen ツールチェーンが連鎖的に不整合:

1. **worker-build 最新(0.2+) は `worker >= 0.8.5` を要求** → 当 crate の worker 0.4 を拒否。
   - `wrangler.toml` は `cargo install -q worker-build@^0.1` に固定（worker 0.4 に対する正しい制約）。
2. **wasm-bindgen 版不一致**: worker-build 0.1 同梱 CLI は `0.2.105`。一方 `js-sys 0.3.103`（worker 0.4.2 が依存）が `wasm-bindgen =0.2.126` を**固定要求**し、0.2.105 へのダウングレードは不可。
3. 結果: Rust→wasm コンパイルは通るが、wasm-bindgen CLI による JS binding 生成ステップで版不一致エラーで停止。

## 改善案

TASK-24（[M5-T0] Workers デプロイツールチェーン現代化）で方向決定後に対応:

- **A（推奨）: worker 0.4 → 0.8 アップグレード**。最新 worker-build + wasm-bindgen で解消。ただし worker 0.8 は Router 廃止・新ルーティング/D1 API 変更があり、`handlers.rs`/`lib.rs`/`db.rs` の再移植が必要（TASK-5 で行った worker 0.4.2 移植の上位互換作業）。
- **B**: js-sys/web-sys/wasm-bindgen を worker-build 0.1 同梱版に合うよう一段階ダウングレードする cascade pin。fragile・非推奨。
- **C**: worker-build を経ず `wasm-pack` 直接運用に切替。

## 優先度

medium

core SDK 同等化（M1-M3, 本計画の主目的）には影響しない。Workers は設計上 M5「別軸」。ただし本番デプロイを行う場合は本課題の解決が必須。

## 関連

- タスク: TASK-24（[M5-T0] Workers デプロイツールチェーン現代化）
- 起票元: TASK-5（[M0-T1] Cargo workspace 移行）の `wrangler deploy --dry-run` 検証
- 関連ファイル:
  - `crates/ygo-search-workers/Cargo.toml`（`worker = "0.4"`）
  - `crates/ygo-search-workers/wrangler.toml`（`worker-build@^0.1` 固定）
  - `Cargo.lock`（wasm-bindgen 0.2.126 / js-sys 0.3.103）
- 設計: `tmp/dev/plan/design.md` 第9.5節（Layer D workers）、M5（別軸）
