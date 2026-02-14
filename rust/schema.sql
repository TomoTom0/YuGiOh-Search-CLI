-- カード情報テーブル
CREATE TABLE IF NOT EXISTS cards (
    card_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    ruby TEXT,
    ciid TEXT,
    imgs TEXT,
    card_type TEXT,
    attribute TEXT,
    level_type TEXT,
    level INTEGER,
    atk INTEGER,
    def INTEGER,
    description TEXT,
    race TEXT,
    monster_types TEXT,
    spell_effect_type TEXT,
    trap_effect_type TEXT,
    link_markers TEXT,
    link_value INTEGER,
    pendulum_scale TEXT,
    pendulum_text TEXT,
    is_extra_deck TEXT,
    normalized_ruby TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- カード名の正規化インデックス（データ投入後に作成）
-- CREATE INDEX IF NOT EXISTS idx_cards_normalized_name ON cards(normalized_name);

-- FAQ情報テーブル
CREATE TABLE IF NOT EXISTS faqs (
    faq_id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    normalized_question TEXT NOT NULL,
    normalized_answer TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (card_id) REFERENCES cards(card_id)
);

-- FAQの正規化テキストインデックス（データ投入後に作成）
-- CREATE INDEX IF NOT EXISTS idx_faqs_normalized_question ON faqs(normalized_question);
-- CREATE INDEX IF NOT EXISTS idx_faqs_normalized_answer ON faqs(normalized_answer);
-- CREATE INDEX IF NOT EXISTS idx_faqs_card_id ON faqs(card_id);

-- カード参照テーブル（FAQ内で参照されるカード）
CREATE TABLE IF NOT EXISTS faq_card_references (
    faq_id INTEGER NOT NULL,
    card_id TEXT NOT NULL,
    card_name TEXT NOT NULL,
    PRIMARY KEY (faq_id, card_id),
    FOREIGN KEY (faq_id) REFERENCES faqs(faq_id),
    FOREIGN KEY (card_id) REFERENCES cards(card_id)
);

CREATE INDEX IF NOT EXISTS idx_faq_card_references_faq_id ON faq_card_references(faq_id);
