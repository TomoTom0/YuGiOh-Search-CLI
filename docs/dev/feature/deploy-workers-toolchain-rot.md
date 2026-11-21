## Workers デプロイパイプラインのツールチェーン腐敗（解決済み）

### ステータス

**解決済み** — TASK-24（[M5-T0] Workers デプロイツールチェーン現代化）で方向 A（worker 0.4 → 0.8 アップグレード）により解消。

### 解決内容（2026-11-21）

| 対象 | 変更 |
|---|---|
| `crates/ygo-search-workers/Cargo.toml` | `worker = "0.4"` -> `worker = "0.8.7"`（0.8.x 最新。`features = ["d1"]` は不変） |
| `crates/ygo-search-workers/wrangler.toml` | build command の worker-build ピンを `^0.1` -> `^0.8.7` へ更新。あわせて wrangler 4 で無効な legacy `[build.upload]` ブロックを除去 |
| `Cargo.lock` | worker / worker-sys / worker-macros 0.8.7・wasm-bindgen 0.2.130・js-sys / web-sys 0.3.107 |

検証結果:

- `cargo build -p ygo-search-workers --target wasm32-unknown-unknown` 成功
- `crates/ygo-search-workers` で `wrangler deploy --dry-run` 成功（旧来失敗していた wasm-bindgen CLI による JS binding 生成ステップを通過。wasm-opt / esbuild 含む。Total Upload 1074.01 KiB / gzip 387.42 KiB）
- feature マトリクス `cargo check`+`cargo test`（default / fs / format / fs+format / vector-search / vector）全 pass・TS unit test 147件 pass・clippy（`-D warnings`）クリーン

### 前提の修正（TASK-24 で判明）

起票時は「worker 0.8 では Router が廃止され、新ルーティング・D1 API の変更があるため src の再移植が必要」と想定していたが、実際には worker 0.8.7 でも `Router`（`get_async` / `post_async` / `run` / `RouteContext`）は存続し、D1 API（`prepare` / `bind(&[JsValue])` / `all` / `first` / `results`）も 0.4 と同形状だった。このため `src/{lib.rs, handlers.rs, db.rs, types.rs}` の再移植は不要で、既存エンドポイント・リクエスト/レスポンス形状を一切変えず、依存バージョン更新のみで移行が完了した。

### 解決前の課題（記録）

`crates/ygo-search-workers`（Cloudflare Workers adapter）は `worker = "0.4"` 依存で、`cargo build --target wasm32-unknown-unknown` は通るものの `wrangler deploy`（worker-build 経由のパッケージング）が失敗する状態だった（TASK-5 [M0-T1] の `wrangler deploy --dry-run` 検証で顕在化）。

1. worker-build の新系は worker 0.4 系を拒否するため、`wrangler.toml` は `cargo install -q worker-build@^0.1` に固定する必要があった
2. wasm-bindgen 版不一致: worker-build 0.1 同梱 CLI は `0.2.105`。一方 `js-sys 0.3.103`（worker 0.4.2 が依存）が `wasm-bindgen =0.2.126` を固定要求し、ダウングレード不可
3. 結果: Rust -> wasm コンパイルは通るが、wasm-bindgen CLI による JS binding 生成ステップで版不一致エラーで停止

不採用の代替案: B（js-sys / web-sys / wasm-bindgen を worker-build 0.1 同梱版へ一段階ダウングレードする cascade pin・fragile）・C（worker-build を経ない wasm-pack 直接運用への切替）。

### 関連

- タスク: TASK-24（[M5-T0] Workers デプロイツールチェーン現代化）
- 起票元: TASK-5（[M0-T1] Cargo workspace 移行）の `wrangler deploy --dry-run` 検証
- 関連ファイル: `crates/ygo-search-workers/{Cargo.toml, wrangler.toml}`・`Cargo.lock`
- 設計: `tmp/dev/plan/design.md` 第9.5節（Layer D workers）、M5（別軸）
