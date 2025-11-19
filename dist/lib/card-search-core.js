/**
 * Core card search logic extracted for library use
 * Used by both CLI (search-cards.ts) and FAQ search (search-faq.ts)
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { findProjectRoot } from '../utils/project-root.js';
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
function valueMatches(fieldValue, cond, mode, flagAutoModify, isNameField, normalizedVal, flagAllowWild, isTextField) {
    if (cond === '' || cond === null || cond === undefined) {
        return fieldValue === '' || fieldValue === null || fieldValue === undefined;
    }
    let searchTarget = flagAutoModify ? (normalizedVal !== undefined ? normalizedVal : normalizeForSearch(fieldValue)) : fieldValue;
    let searchPattern = flagAutoModify ? normalizeForSearch(String(cond)) : String(cond);
    if (isTextField && String(cond).includes('-"')) {
        const negativeMatches = String(cond).match(/-["'`]([^"'`]+)["'`]/g);
        if (negativeMatches) {
            for (const negMatch of negativeMatches) {
                const phrase = negMatch.slice(2, -1);
                const normalizedPhrase = flagAutoModify ? normalizeForSearch(phrase) : phrase;
                if (searchTarget.includes(normalizedPhrase)) {
                    return false;
                }
            }
            searchPattern = String(cond).replace(/-["'`][^"'`]+["'`]/g, '').trim();
            if (!searchPattern)
                return true;
            searchPattern = flagAutoModify ? normalizeForSearch(searchPattern) : searchPattern;
        }
    }
    if (mode === 'partial') {
        return searchTarget.includes(searchPattern);
    }
    if (flagAllowWild && searchPattern.includes('*')) {
        const regexPattern = searchPattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(searchTarget);
    }
    return searchTarget === searchPattern;
}
/**
 * Search cards by filter
 * Returns array of Card objects matching the filter
 */
export async function searchCards(params) {
    const { filter: filterRaw, cols = null, mode = 'exact', includeRuby = true, flagAutoModify = true, flagAllowWild = true } = params;
    // Normalize filter
    const filter = {};
    for (const k of Object.keys(filterRaw)) {
        const v = filterRaw[k];
        if (v && typeof v === 'object' && (v.op || Array.isArray(v.cond) || v.cond)) {
            const op = v.op === 'or' ? 'or' : 'and';
            const cond = Array.isArray(v.cond) ? v.cond : (v.cond !== undefined ? [v.cond] : []);
            filter[k] = { op, cond };
        }
        else if (Array.isArray(v)) {
            filter[k] = { op: 'or', cond: v };
        }
        else {
            filter[k] = { op: 'and', cond: [v] };
        }
    }
    const projectRoot = await findProjectRoot();
    const dataDir = path.join(projectRoot, 'data');
    const cardsFile = path.join(dataDir, 'cards-all.tsv');
    if (!fs.existsSync(cardsFile)) {
        throw new Error(`Cards file not found: ${cardsFile}`);
    }
    const rl = readline.createInterface({
        input: fs.createReadStream(cardsFile),
        crlfDelay: Infinity
    });
    const results = [];
    let headers = [];
    let nameModifiedIndex = -1;
    for await (const line of rl) {
        if (!line)
            continue;
        if (headers.length === 0) {
            headers = line.split('\t');
            nameModifiedIndex = headers.indexOf('nameModified');
            continue;
        }
        const parts = line.split('\t');
        const obj = {};
        for (let i = 0; i < headers.length; i++) {
            obj[headers[i]] = parts[i] === undefined ? '' : parts[i];
        }
        let ok = true;
        for (const k of Object.keys(filter)) {
            const f = filter[k];
            if (!f || f.cond.length === 0)
                continue;
            const matches = f.cond.map((cond) => {
                const useMode = (k === 'name') ? mode : 'exact';
                const fieldValue = obj[k] === undefined ? '' : obj[k];
                const isNameField = (k === 'name');
                const isTextField = ['text', 'pendulumText', 'supplementInfo', 'pendulumSupplementInfo'].includes(k);
                const normalizedVal = (isNameField && nameModifiedIndex >= 0) ? obj['nameModified'] : undefined;
                const matchesField = valueMatches(fieldValue, cond, useMode, flagAutoModify, isNameField, normalizedVal, flagAllowWild, isTextField);
                if (k === 'name' && includeRuby && !matchesField) {
                    const rubyValue = obj['ruby'] === undefined ? '' : obj['ruby'];
                    return valueMatches(rubyValue, cond, useMode, flagAutoModify, true, undefined, flagAllowWild, false);
                }
                return matchesField;
            });
            const passed = f.op === 'or' ? matches.some(Boolean) : matches.every(Boolean);
            if (!passed) {
                ok = false;
                break;
            }
        }
        if (ok) {
            // Build Card object (only fields that exist in headers)
            const card = { cardType: parts[0], name: parts[1], cardId: parts[4] };
            // Add all other fields from TSV
            for (let i = 0; i < headers.length; i++) {
                if (parts[i] !== undefined && parts[i] !== '') {
                    card[headers[i]] = parts[i];
                }
            }
            results.push(card);
        }
    }
    return results;
}
//# sourceMappingURL=card-search-core.js.map