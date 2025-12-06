#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import url from 'url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '..', 'search-cards.js');
const COLUMN_DEFINITIONS = {
    // Basic information
    cardType: {
        description: 'Card type (monster, spell, trap)',
        type: 'enum',
        values: [
            'monster',
            'spell',
            'trap'
        ]
    },
    name: {
        description: 'Official card name',
        type: 'string',
        example: '青眼の白龍'
    },
    nameModified: {
        description: 'Normalized name for search (whitespace/symbols removed, hiragana→katakana)',
        type: 'string',
        example: '青眼ノ白龍'
    },
    ruby: {
        description: 'Card name reading (furigana)',
        type: 'string',
        example: 'ブルーアイズ・ホワイト・ドラゴン'
    },
    cardId: {
        description: 'Unique card identifier',
        type: 'string',
        example: '4007'
    },
    ciid: {
        description: 'Additional identifier',
        type: 'string'
    },
    imgs: {
        description: 'Card images (JSON array as string)',
        type: 'json-array'
    },
    text: {
        description: 'Card effect text',
        type: 'string'
    },
    // Monster-specific
    attribute: {
        description: 'Monster attribute',
        type: 'enum',
        values: [
            'dark',
            'divine',
            'earth',
            'fire',
            'light',
            'water',
            'wind'
        ]
    },
    levelType: {
        description: 'Level type (level, rank, or link)',
        type: 'enum',
        values: [
            'level',
            'rank',
            'link'
        ]
    },
    levelValue: {
        description: 'Level/Rank/Link value (0-13)',
        type: 'number'
    },
    race: {
        description: 'Monster race/type',
        type: 'enum',
        values: [
            'aqua',
            'beast',
            'beastwarrior',
            'creatorgod',
            'cyberse',
            'dinosaur',
            'divine',
            'dragon',
            'fairy',
            'fiend',
            'fish',
            'illusion',
            'insect',
            'machine',
            'plant',
            'psychic',
            'pyro',
            'reptile',
            'rock',
            'seaserpent',
            'spellcaster',
            'thunder',
            'warrior',
            'windbeast',
            'wyrm',
            'zombie'
        ]
    },
    monsterTypes: {
        description: 'Monster types (JSON array, e.g. "effect", "fusion", "synchro")',
        type: 'json-array',
        values: [
            'normal',
            'effect',
            'fusion',
            'ritual',
            'synchro',
            'xyz',
            'link',
            'pendulum',
            'tuner',
            'spirit',
            'union',
            'gemini',
            'flip',
            'toon',
            'special'
        ]
    },
    atk: {
        description: 'Attack power (number or "?")',
        type: 'string|number'
    },
    def: {
        description: 'Defense power (number or "?")',
        type: 'string|number'
    },
    linkMarkers: {
        description: 'Link marker positions (JSON array)',
        type: 'json-array',
        values: [
            'top',
            'bottom',
            'left',
            'right',
            'top-left',
            'top-right',
            'bottom-left',
            'bottom-right'
        ]
    },
    pendulumScale: {
        description: 'Pendulum scale (0-13)',
        type: 'number'
    },
    pendulumText: {
        description: 'Pendulum effect text',
        type: 'string'
    },
    isExtraDeck: {
        description: 'Whether card belongs to Extra Deck (for fusion/synchro/xyz/link)',
        type: 'boolean'
    },
    // Spell-specific
    spellEffectType: {
        description: 'Spell card type',
        type: 'enum',
        values: [
            'normal',
            'quick',
            'continuous',
            'equip',
            'field',
            'ritual'
        ]
    },
    // Trap-specific
    trapEffectType: {
        description: 'Trap card type',
        type: 'enum',
        values: [
            'normal',
            'continuous',
            'counter'
        ]
    },
    // Detail fields
    supplementInfo: {
        description: 'Supplementary card effect information',
        type: 'string'
    },
    supplementDate: {
        description: 'Last update date of supplement info (YYYY-MM-DD)',
        type: 'date'
    },
    pendulumSupplementInfo: {
        description: 'Supplementary pendulum effect information',
        type: 'string'
    },
    pendulumSupplementDate: {
        description: 'Last update date of pendulum supplement info (YYYY-MM-DD)',
        type: 'date'
    }
};
function showColumns() {
    console.log(`利用可能なカラム一覧
==================

カラムは --cols または cols= パラメータで指定して出力できます：
  ygo_search --name "青眼" --cols name,ruby,atk,def
  ygo_search name=ドラゴン cols=name,race,levelValue

ほとんどのカラムはフィルタに対応していますが、フィルタ不可のカラムは下記に表記されています。
フィルタ不可のカラムは --cols での出力のみに使用できます。

カラムリファレンス:
`);
    // Define filter-supported columns
    const filterableColumns = [
        'name',
        'text',
        'cardId',
        'cardType',
        'race',
        'attribute',
        'atk',
        'def',
        'level',
        'levelValue',
        'pendulumScale',
        'ruby',
        'linkValue',
        'linkArrows',
        'monsterTypes'
    ];
    const categories = {
        '基本情報': [
            'cardType',
            'name',
            'nameModified',
            'ruby',
            'cardId',
            'ciid',
            'imgs',
            'text'
        ],
        'モンスターフィールド': [
            'attribute',
            'levelType',
            'levelValue',
            'race',
            'monsterTypes',
            'atk',
            'def',
            'linkMarkers',
            'pendulumScale',
            'pendulumText',
            'isExtraDeck'
        ],
        '魔法・罠フィールド': [
            'spellEffectType',
            'trapEffectType'
        ],
        '補足情報': [
            'supplementInfo',
            'supplementDate',
            'pendulumSupplementInfo',
            'pendulumSupplementDate'
        ]
    };
    for (const [category, columns] of Object.entries(categories)){
        console.log(`\n${category}`);
        console.log('-'.repeat(category.length));
        for (const col of columns){
            const def = COLUMN_DEFINITIONS[col];
            if (!def) continue;
            const isFilterable = filterableColumns.includes(col);
            const modeLabel = isFilterable ? '' : ' (フィルタ不可)';
            console.log(`\n  ${col}${modeLabel}`);
            console.log(`    Type: ${def.type}`);
            console.log(`    Desc: ${def.description}`);
            if ('example' in def && def.example) {
                console.log(`    Ex:   ${def.example}`);
            }
            if ('values' in def && def.values && def.values.length > 0) {
                const vals = def.values.slice(0, 5).join(', ');
                const suffix = def.values.length > 5 ? '...' : '';
                console.log(`    Vals: ${vals}${suffix}`);
            }
        }
    }
    console.log(`
カラムセット（よく使う組み合わせ）:
  基本:     name,cardId
  全情報:   name,cardId,text,atk,def,race,attribute
  モンスター: name,race,attribute,levelValue,atk,def
  魔法:     name,spellEffectType,text
  罠:      name,trapEffectType,text
  詳細:     name,supplementInfo,supplementDate
`);
}
async function main() {
    const args = process.argv.slice(2);
    // Handle subcommands
    if (args.length > 0 && (args[0] === 'columns' || args[0] === '--columns')) {
        showColumns();
        process.exit(0);
    }
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_search [command] [options]

Search Yu-Gi-Oh cards database.

Commands:
  columns               Show all available columns and their descriptions
  (no command)          Search cards (default)

Filter Options (at least one required):
  --name <value>            Card name filter
  --text <value>            Card text filter
  --cardId <value>          Card ID filter (supports: comma-separated values or JSON array)
  --cardType <value>        Card type filter (monster, spell, trap)
  --race <value>            Race/type filter (dragon, warrior, etc.)
  --attribute <value>       Attribute filter (LIGHT, DARK, etc.)
  --atk <value>             ATK value filter
  --def <value>             DEF value filter
  --level <value>           Level filter
  --levelValue <value>      Level value filter (numeric)
  --pendulumScale <value>   Pendulum scale filter
  --ruby <value>            Ruby (reading) filter
  --linkValue <value>       Link value filter
  --linkArrows <value>      Link arrows filter
  --monsterTypes <value>    Monster types (JSON array format, e.g. '["effect","fusion"]' or comma-separated)

Output Options:
  --cols <col1,col2,...>    Columns to return (comma-separated)
  --max <N>                 Maximum results (default: 100)
  --sort <field[:order]>    Sort by field (order: asc|desc)
                            Fields: cardId, name, ruby, atk, def, levelValue, etc.
  --raw                     Raw output mode (suppresses warnings)

Search Options:
  --mode <exact|partial>    Search mode (default: exact)
  --flagAllowWild <bool>    Enable wildcard search with * (default: true)
  --flagAutoModify <bool>   Normalize text for matching (default: true)
  --flagNearly <bool>       Fuzzy matching for typos (default: false)
  --includeRuby <bool>      Search ruby field for name (default: true)
  --flagAutoPend <bool>     Auto-include pendulum text (default: true)
  --flagAutoSupply <bool>   Auto-include supplement info (default: true)
  --flagAutoRuby <bool>     Auto-include ruby for name (default: true)

Alternative Formats:
  All options can also be specified as key=value:
  name=青眼 text=*破壊* cols=name,cardId max=50 sort=atk:desc

  Or as JSON format:
  ygo_search '{"name":"青眼"}' cols=name,cardId

Examples:

Subcommands:
  ygo_search columns

Basic Searches:
  ygo_search --name "青眼の白龍"
  ygo_search --name "青眼の白龍" --cols name,cardId,text
  ygo_search --cardType trap --sort name --cols name,text

Advanced Filtering:
  ygo_search --text "*破壊*" --max 50 --sort atk:desc
  ygo_search --race dragon --atk 3000 --sort levelValue:asc --cols name,atk,def,race

Array Parameters:
  ygo_search --cardId 19723,21820,21207 --cols name,cardId
  ygo_search --monsterTypes '["effect","fusion"]' --cols name

Alternative Formats:
  ygo_search name=青眼の白龍 cols=name,cardId,text
  ygo_search '{"name":"青眼の白龍"}' cols=name,cardId,text
`);
        process.exit(0);
    }
    const proc = spawn('node', [
        scriptPath,
        ...args
    ], {
        stdio: 'inherit'
    });
    proc.on('exit', (code)=>{
        process.exit(code || 0);
    });
}
main().catch((err)=>{
    console.error('Error:', err.message);
    process.exit(1);
});
