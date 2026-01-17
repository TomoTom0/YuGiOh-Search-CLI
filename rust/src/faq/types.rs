use crate::search::Card;

/// カード参照情報
#[derive(Debug, Clone, PartialEq)]
pub struct CardReference {
    pub name: String,
    pub card_id: String,
}

/// FAQレコード
#[derive(Debug, Clone, PartialEq)]
pub struct FAQRecord {
    pub faq_id: u32,
    pub card_id: String,
    pub question: String,
    pub answer: String,
    pub normalized_question: String,
    pub normalized_answer: String,
    pub card_references: Vec<CardReference>,
    pub card_info: Option<Card>,
}

impl FAQRecord {
    pub fn new(
        faq_id: u32,
        card_id: &str,
        question: &str,
        answer: &str,
    ) -> Self {
        let normalized_question = crate::normalize::normalize_for_search(question);
        let normalized_answer = crate::normalize::normalize_for_search(answer);
        Self {
            faq_id,
            card_id: card_id.to_string(),
            question: question.to_string(),
            answer: answer.to_string(),
            normalized_question,
            normalized_answer,
            card_references: Vec::new(),
            card_info: None,
        }
    }

    pub fn with_card_references(mut self, references: Vec<CardReference>) -> Self {
        self.card_references = references;
        self
    }

    pub fn with_card_info(mut self, card_info: Card) -> Self {
        self.card_info = Some(card_info);
        self
    }
}
