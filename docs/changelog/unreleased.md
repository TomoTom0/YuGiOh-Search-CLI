# 次期バージョン（未リリース）

## New Features

- Workers adapter に seek / convert エンドポイント追加（TASK-27）: `GET /api/cards/seek`（ランダム/範囲/先頭 N 件・TS `seek-cards.ts` 準拠）と `POST /api/convert`（json/jsonl 相互変換・TS `convert.ts` 準拠）を `crates/ygo-search-workers` に追加。エラー応答は TS `errorResponse` と同一形状・同一 CORS ヘッダ（`Access-Control-Allow-Origin: *`、成功応答と同じ）。convert のパース/整形は worker 型に依存しない純粋関数として実装し、単体テスト 11 件を追加
- Workers adapter の seek エンドポイントに `cols`/`colAll` 列投影を追加（TASK-51）: `GET /api/cards/seek` が `cols`（`,` 区切り・trim 対応・whitelist 完全一致検証）と `colAll`（whitelist 17 列の明示列挙）を受け付ける。応答 `data` を D1 row の直接透過（key は D1 列名＝snake_case・選択列のみ）に変更し、cols/colAll 無指定時は TS 正本と同じ `card_id, name` 既定投影になる（旧実装の全 9 列 `CardInfo` 固定応答からの破壊的変更。repo 内に Rust adapter seek の消費者なし）。cols の未知列・空セグメントは TS と同じ観測挙動の 500 で応答。TS が cols を SQL へ直接結合する箇所は whitelist 検証済み列のみを SQL に入れる構成に置き換え（SQL injection 面の除去・正本に対する意図した逸脱）。単体テスト 15 件を追加

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

- Workers デプロイツールチェーン現代化（TASK-24）: Rust Workers crate の worker 依存を 0.4.2 -> 0.8.7 へ、wrangler.toml の worker-build ピンを ^0.1 -> ^0.8.7 へ更新し legacy `[build.upload]` を除去。`wrangler deploy --dry-run`（wasm-bindgen binding 生成ステップ含む）が通る状態に復旧

## Known Issues

（変更内容をここに記載）
