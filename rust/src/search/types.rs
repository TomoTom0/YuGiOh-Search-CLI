/// カード情報
#[derive(Debug, Clone, PartialEq)]
pub struct Card {
    pub card_id: String,
    pub name: String,
    pub normalized_name: String,
}

impl Card {
    pub fn new(card_id: &str, name: &str, normalized_name: &str) -> Self {
        Self {
            card_id: card_id.to_string(),
            name: name.to_string(),
            normalized_name: normalized_name.to_string(),
        }
    }
}
