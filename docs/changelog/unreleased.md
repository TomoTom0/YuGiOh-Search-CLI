# 次期バージョン（未リリース）

## New Features

- Workers adapter に seek / convert エンドポイント追加（TASK-27）: `GET /api/cards/seek`（ランダム/範囲/先頭 N 件・TS `seek-cards.ts` 準拠）と `POST /api/convert`（json/jsonl 相互変換・TS `convert.ts` 準拠）を `crates/ygo-search-workers` に追加。エラー応答は TS `errorResponse` と同一形状・同一 CORS ヘッダ（`Access-Control-Allow-Origin: *`、成功応答と同じ）。convert のパース/整形は worker 型に依存しない純粋関数として実装し、単体テスト 11 件を追加
- Workers adapter の seek エンドポイントに `cols`/`colAll` 列投影を追加（TASK-51）: `GET /api/cards/seek` が `cols`（`,` 区切り・trim 対応・whitelist 完全一致検証）と `colAll`（whitelist 17 列の明示列挙）を受け付ける。応答 `data` を D1 row の直接透過（key は D1 列名＝snake_case・選択列のみ）に変更し、cols/colAll 無指定時は TS 正本と同じ `card_id, name` 既定投影になる（旧実装の全 9 列 `CardInfo` 固定応答からの破壊的変更。repo 内に Rust adapter seek の消費者なし）。cols の未知列・空セグメントは TS と同じ観測挙動の 500 で応答。TS が cols を SQL へ直接結合する箇所は whitelist 検証済み列のみを SQL に入れる構成に置き換え（SQL injection 面の除去・正本に対する意図した逸脱）。単体テスト 15 件を追加
- core Rust SDK に `fs::seek_cards_projected` を追加（TASK-53）: 型付き `fs::seek_cards` が `cols`/`colAll` を無視し `detail-all.tsv` のマージも行わなかった TS `seekCards` パリティの機能差を解消。動的レコード `Vec<serde_json::Value>`（キー順 = effectiveCols 順）を返し、TS と同一の列投影・detail マージ（cardId 結合・既存キー不更新・全フィールドの backslash-n アンエスケープ）・`parseInt` 意味論の range フィルタ・`--all requires --range` 検証を実装。キー順保持のため core crate の `serde_json` に `preserve_order` feature を有効化（従来 `Map` がソート順だった JSON 出力の key 順が挿入順に変わる）。統合テスト 8 件（`tests/seek_projected.rs`）を追加

## Bug Fixes

- Workers adapter seek の `range_start`/`range_end` 空文字を「無し」扱いに修正（TASK-51）: TS 正本 `seek-cards.ts` の truthiness 判定（`rangeStart && rangeEnd`）と揃えた。`?all=true&range_start=&range_end=5` が旧実装では空文字を範囲扱いして BETWEEN を実行していた TS 逸脱を解消（現行は 400 "all parameter requires range_start and range_end"）

## Changes

（変更内容をここに記載）

## Performance

（変更内容をここに記載）

## Refactoring

（変更内容をここに記載）

## Repository Management

（変更内容をここに記載）

## Internal Improvements

- Workers adapter seek の TS 準拠細部を検証し負債を解消（TASK-52）: `max=abc`（parseInt NaN）は TS では検証を素通りして D1 bind エラー -> 500 になることを正本から確認し、Rust 版の「既定値扱い -> 200」を意図した逸脱として doc comment に明記。クエリのペア区切りは `query_pairs`（form_urlencoded）・`URLSearchParams` とも `&` のみで `;` は区切りにならないことを実検証し、`cols=name;atk` が未知列 -> 500 で TS と同一の観測挙動になることをテストで固定。`SeekSelect::Columns` の非空を不変条件として `build_seek_sql` に debug_assert を追加。いずれも観測挙動の変更なし。単体テスト 3 件を追加

- Workers デプロイツールチェーン現代化（TASK-24）: Rust Workers crate の worker 依存を 0.4.2 -> 0.8.7 へ、wrangler.toml の worker-build ピンを ^0.1 -> ^0.8.7 へ更新し legacy `[build.upload]` を除去。`wrangler deploy --dry-run`（wasm-bindgen binding 生成ステップ含む）が通る状態に復旧

## Known Issues

（変更内容をここに記載）
