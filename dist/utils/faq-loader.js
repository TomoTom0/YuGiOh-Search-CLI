import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { findProjectRoot } from './project-root.js';
let cachedIndex = null;
let cardsCache = null;
export function extractCardReferences(text) {
    const pattern = /\{\{([^|]+)\|(\d+)\}\}/g;
    const refs = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
        refs.push({
            cardId: parseInt(match[2]),
            cardName: match[1],
            position: match.index
        });
    }
    return refs;
}
function normalizeForSearch(str) {
    if (!str)
        return '';
    return str
        .replace(/[\s\u3000]+/g, '')
        .replace(/[・★☆※‼！？。、,.，．:：;；「」『』【】〔〕（）()［］\[\]｛｝{}〈〉《》〜～~\-－_＿\/／\\＼|｜&＆@＠#＃$＄%％^＾*＊+＋=＝<＜>＞'"\"'""''`´｀]/g, '')
        .replace(/竜/g, '龍')
        .replace(/剣/g, '劍')
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .toLowerCase()
        .replace(/[\u3041-\u3096]/g, (s) => String.fromCharCode(s.charCodeAt(0) + 0x60));
}
function isCardType(value) {
    return ['monster', 'spell', 'trap'].includes(value);
}
function isAttribute(value) {
    return ['dark', 'divine', 'earth', 'fire', 'light', 'water', 'wind'].includes(value);
}
function isLevelType(value) {
    return ['level', 'rank', 'link'].includes(value);
}
function isRace(value) {
    return ['aqua', 'beast', 'beastwarrior', 'creatorgod', 'cyberse', 'dinosaur',
        'divine', 'dragon', 'fairy', 'fiend', 'fish', 'illusion', 'insect',
        'machine', 'plant', 'psychic', 'pyro', 'reptile', 'rock', 'seaserpent',
        'spellcaster', 'thunder', 'warrior', 'windbeast', 'wyrm', 'zombie'].includes(value);
}
function isSpellEffectType(value) {
    return ['normal', 'quick', 'continuous', 'equip', 'field', 'ritual'].includes(value);
}
function isTrapEffectType(value) {
    return ['normal', 'continuous', 'counter'].includes(value);
}
async function loadCards() {
    if (cardsCache)
        return cardsCache;
    const projectRoot = await findProjectRoot();
    const cardsPath = path.join(projectRoot, 'data', 'cards-all.tsv');
    const fileStream = fs.createReadStream(cardsPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    const cards = new Map();
    let isFirst = true;
    for await (const line of rl) {
        if (isFirst) {
            isFirst = false;
            continue;
        }
        const parts = line.split('\t');
        if (parts.length < 5)
            continue;
        const card = {
            cardType: isCardType(parts[0]) ? parts[0] : 'monster',
            name: parts[1],
            nameModified: parts[2],
            ruby: parts[3],
            cardId: parts[4],
            ciid: parts[5] || undefined,
            imgs: parts[6] || undefined,
            text: parts[7] || undefined,
            attribute: parts[8] && isAttribute(parts[8]) ? parts[8] : undefined,
            levelType: parts[9] && isLevelType(parts[9]) ? parts[9] : undefined,
            levelValue: parts[10] || undefined,
            race: parts[11] && isRace(parts[11]) ? parts[11] : undefined,
            monsterTypes: parts[12] || undefined,
            atk: parts[13] || undefined,
            def: parts[14] || undefined,
            linkMarkers: parts[15] || undefined,
            pendulumScale: parts[16] || undefined,
            pendulumText: parts[17] || undefined,
            isExtraDeck: parts[18] || undefined,
            spellEffectType: parts[19] && isSpellEffectType(parts[19]) ? parts[19] : undefined,
            trapEffectType: parts[20] && isTrapEffectType(parts[20]) ? parts[20] : undefined,
        };
        cards.set(card.cardId, card);
    }
    cardsCache = cards;
    return cards;
}
export async function loadFAQIndex() {
    if (cachedIndex)
        return cachedIndex;
    const projectRoot = await findProjectRoot();
    const faqPath = path.join(projectRoot, 'data', 'faq-all.tsv');
    const fileStream = fs.createReadStream(faqPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    const byId = new Map();
    const byCardId = new Map();
    const normalized = new Map();
    let isFirst = true;
    for await (const line of rl) {
        if (isFirst) {
            isFirst = false;
            continue;
        }
        const parts = line.split('\t');
        if (parts.length < 4)
            continue;
        const faqId = parseInt(parts[0]);
        const question = parts[1];
        const answer = parts[2];
        const updatedAt = parts[3];
        const faq = { faqId, question, answer, updatedAt };
        byId.set(faqId, faq);
        normalized.set(faqId, {
            question: normalizeForSearch(question),
            answer: normalizeForSearch(answer)
        });
        const questionRefs = extractCardReferences(question);
        const answerRefs = extractCardReferences(answer);
        const allCardIds = new Set([
            ...questionRefs.map(r => r.cardId),
            ...answerRefs.map(r => r.cardId)
        ]);
        for (const cardId of allCardIds) {
            if (!byCardId.has(cardId)) {
                byCardId.set(cardId, []);
            }
            byCardId.get(cardId).push(faqId);
        }
    }
    cachedIndex = { byId, byCardId, normalized };
    return cachedIndex;
}
export async function getCardsByIds(cardIds) {
    const cards = await loadCards();
    const result = new Map();
    for (const cardId of cardIds) {
        const card = cards.get(String(cardId));
        if (card) {
            result.set(cardId, card);
        }
    }
    return result;
}
export function clearCache() {
    cachedIndex = null;
    cardsCache = null;
}
//# sourceMappingURL=faq-loader.js.map