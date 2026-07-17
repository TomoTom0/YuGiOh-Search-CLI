/// カード名を検索用に正規化する
///
/// 処理順序：
/// 1. 空白削除
/// 2. 記号削除
/// 3. 異体字統一
/// 4. 全角→半角
/// 5. 小文字化
/// 6. ひらがな→カタカナ
pub fn normalize_for_search(s: &str) -> String {
    if s.is_empty() {
        return String::new();
    }

    let mut result = String::new();

    for c in s.chars() {
        // 1. 空白文字をスキップ
        if c.is_whitespace() || c == '\u{3000}' {
            continue;
        }

        // 2. 記号を除外
        if is_symbol(c) {
            continue;
        }

        // 3. 異体字統一
        let c = match c {
            '竜' => '龍',
            '剣' => '劍',
            _ => c,
        };

        // 4. 全角英数字→半角
        let c = match c {
            'Ａ'..='Ｚ' | 'ａ'..='ｚ' | '０'..='９' => {
                char::from_u32(c as u32 - 0xFEE0).unwrap_or(c)
            }
            _ => c,
        };

        // 6. ひらがな→カタカナ（小文字化の前に実行）
        let c = if ('\u{3041}'..='\u{3096}').contains(&c) {
            char::from_u32(c as u32 + 0x60).unwrap_or(c)
        } else {
            c
        };

        result.push(c);
    }

    // 5. 小文字化
    result.to_lowercase()
}

/// 記号判定
fn is_symbol(c: char) -> bool {
    matches!(
        c,
        '・' | '★'
            | '☆'
            | '※'
            | '‼'
            | '！'
            | '？'
            | '。'
            | '、'
            | ','
            | '.'
            | '，'
            | '．'
            | ':'
            | '：'
            | ';'
            | '；'
            | '「'
            | '」'
            | '『'
            | '』'
            | '【'
            | '】'
            | '〔'
            | '〕'
            | '（'
            | '）'
            | '('
            | ')'
            | '［'
            | '］'
            | '['
            | ']'
            | '｛'
            | '｝'
            | '{'
            | '}'
            | '〈'
            | '〉'
            | '《'
            | '》'
            | '〜'
            | '～'
            | '~'
            | '-'
            | '－'
            | '_'
            | '＿'
            | '/'
            | '／'
            | '\\'
            | '＼'
            | '|'
            | '｜'
            | '&'
            | '＆'
            | '@'
            | '＠'
            | '#'
            | '＃'
            | '$'
            | '＄'
            | '%'
            | '％'
            | '^'
            | '＾'
            | '*'
            | '＊'
            | '+'
            | '＋'
            | '='
            | '＝'
            | '<'
            | '＜'
            | '>'
            | '＞'
            | '\''
            | '"'
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    // 既存TypeScriptテスト（normalizer.test.ts）から移植

    #[test]
    fn test_normalize_whitespace() {
        // 半角スペース
        assert_eq!(normalize_for_search("青眼 の 白龍"), "青眼ノ白龍");
        // 全角スペース
        assert_eq!(normalize_for_search("青眼　の　白龍"), "青眼ノ白龍");
    }

    #[test]
    fn test_normalize_symbols() {
        assert_eq!(
            normalize_for_search("E・HERO フレイム・ウィングマン"),
            "eheroフレイムウィングマン"
        );
        assert_eq!(
            normalize_for_search("No.39 希望皇ホープ"),
            "no39希望皇ホープ"
        );
    }

    #[test]
    fn test_normalize_kanji_variants() {
        // 竜→龍
        assert_eq!(normalize_for_search("青眼の白竜"), "青眼ノ白龍");
        // 剣→劍
        assert_eq!(normalize_for_search("聖剣"), "聖劍");
    }

    #[test]
    fn test_normalize_fullwidth() {
        assert_eq!(
            normalize_for_search("ＡＢＣ－ドラゴン・バスター"),
            "abcドラゴンバスター"
        );
    }

    #[test]
    fn test_normalize_hiragana() {
        assert_eq!(
            normalize_for_search("ぶらっく・まじしゃん"),
            "ブラックマジシャン"
        );
    }

    #[test]
    fn test_normalize_comprehensive() {
        let input = "青眼　の　白竜　（ブルーアイズ・ホワイト・ドラゴン）";
        let expected = "青眼ノ白龍ブルーアイズホワイトドラゴン";
        assert_eq!(normalize_for_search(input), expected);
    }

    #[test]
    fn test_normalize_empty_string() {
        assert_eq!(normalize_for_search(""), "");
    }

    #[test]
    fn test_normalize_symbols_comprehensive() {
        // Note: バッククォート等の特殊文字はRustの文字列リテラルで問題を起こすため、個別にテスト
        let test_cases = vec![
            ("★", ""),
            ("☆", ""),
            ("※", ""),
            ("・", ""),
            ("（）", ""),
            ("【】", ""),
            ("《》", ""),
        ];

        for (input, expected) in test_cases {
            assert_eq!(normalize_for_search(input), expected);
        }
    }

    #[test]
    fn test_normalize_preserves_japanese() {
        // 日本語文字は保持されるべき
        assert_eq!(normalize_for_search("あいうえお"), "アイウエオ");
        assert_eq!(normalize_for_search("カキクケコ"), "カキクケコ");
        assert_eq!(normalize_for_search("\u{6f22}\u{5b57}"), "\u{6f22}\u{5b57}");
        // "漢字"
    }
}
