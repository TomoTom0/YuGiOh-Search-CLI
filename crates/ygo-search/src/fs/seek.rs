//! `seek_cards`（TS `src/lib/seek-cards.ts` の Rust 移植）。
//!
//! cards-all.tsv をキャッシュ経由で読み込み、ランダム/範囲/先頭 N 件の選択を行う。
//!
//! # TS との差異（構造化戻り値に起因）
//! - 戻り値は構造化 [`Vec<Card>`]。TS は `Record<string, string>[]`（動的カラム）だが、
//!   Rust 版は [`super::search::search_cards`] と同様に固定スキーマの `Card` を返す。
//! - `cols` / `colAll`（列投影）は `Card` 構造体に対して意味を持たず**無視**される
//!   （全フィールドを返却）。列投影は TS の動的レコードモデル固有の機能。
//! - detail-all.tsv のマージは行わない（`Card` に補足情報列が存在しないため）。

use rand::seq::SliceRandom;

use crate::types::options::SeekCardsOptions;
use crate::types::Card;

use super::{load_cards, FsError};

/// `seekCards(opts) -> Card[]`（TS `seek-cards.ts`）。
///
/// 既定値: `max=10`, `random=true`, `all=false`。
/// - `range=[start,end]`: cardId 範囲フィルタ（両端含む・数値化不可行は除外）。
/// - `all=true`: 範囲内の全カードを返す（`range` 必須・`max` 無視）。`range` 無しはエラー。
/// - `random=true`: 重複なしランダム抽出（`min(max, len)` 件）。
/// - `random=false`: 先頭 N 件（TSV 行順）。
pub fn seek_cards(opts: &SeekCardsOptions) -> Result<Vec<Card>, FsError> {
    let max = opts.max.unwrap_or(10) as usize;
    let random = opts.random.unwrap_or(true);
    let all = opts.all.unwrap_or(false);

    // TS: `if (all && !range) throw new Error('--all requires --range')`
    if all && opts.range.is_none() {
        return Err(FsError::InvalidOption(
            "--all requires --range".to_string(),
        ));
    }

    let mut cards = load_cards()?;

    // 範囲フィルタ（TS: parseInt(card.cardId) で isNaN/範囲外を skip）
    if let Some([start, end]) = opts.range {
        cards.retain(|c| match c.card_id.parse::<u32>() {
            Ok(id) => id >= start && id <= end,
            Err(_) => false,
        });
    }

    let selected: Vec<Card> = if all {
        cards
    } else if random {
        // 重複なしランダム抽出（TS は Set + Math.random、本実装は rand の choose_multiple）
        let count = max.min(cards.len());
        let mut rng = rand::thread_rng();
        cards.choose_multiple(&mut rng, count).cloned().collect()
    } else {
        // 先頭 N 件（TSV 行順）
        cards.into_iter().take(max).collect()
    };

    Ok(selected)
}
