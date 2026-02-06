#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import url from 'url';
import { extractAndSearchCards } from '../lib/extract-and-search-cards.js';
import { judgeAndReplace } from '../lib/judge-and-replace.js';
import { getTsvPath, getTmpPath, getTmpDir } from '../lib/config/paths.js';
import { findDocs, showDoc, listDocs, findDocByName } from '../lib/cli-docs.js';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
// SIGINT ハンドラをセットアップする共通ヘルパー
function setupInterruptHandler() {
    const state = {
        interrupted: false
    };
    process.on('SIGINT', async ()=>{
        console.error('\n\n中断を検出しました。処理を終了します...');
        state.interrupted = true;
        process.exit(130);
    });
    return {
        get interrupted () {
            return state.interrupted;
        },
        setInterrupted (value) {
            state.interrupted = value;
        }
    };
}
// カラム定義（旧 ygo_search.ts から）
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
  ygo_search card --name "青眼" --cols name,ruby,atk,def
  ygo_search card name=ドラゴン cols=name,race,levelValue

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
// サブコマンドのヘルプメッセージ
function showHelp() {
    console.log(`Usage: ygo_search <command> [options]

Yu-Gi-Oh カードデータベース検索ツール

Commands:
  card [filters]        カード検索（デフォルト）
  faq [params]          FAQ検索
  extract <text>        カード名抽出
  replace <text>        カード名置換
  seek [options]        ランダムカード取得
  bulk [queries]        複数クエリを一括検索
  convert <in:out>      フォーマット変換（JSON/JSONL/YAML）
  vector setup [type]   Vector DBセットアップ（cards/faqs/all）
  docs [name]           APIドキュメント参照
  update                データ更新
  help                  このヘルプを表示

Options:
  --help, -h            コマンドのヘルプを表示

Examples:
  ygo_search card --name "青眼の白龍"
  ygo_search faq cardId=6808
  ygo_search extract "青眼の白龍とブラック・マジシャンを召喚"
  ygo_search replace "{青眼の白龍}を召喚して攻撃"
    # => {"processedText":"{{青眼の白龍|4007}}を召喚して攻撃",...}
  ygo_search seek
  ygo_search bulk '[{"name":"青眼"},{"name":"ブラック・マジシャン"}]'
  ygo_search convert input.json:output.yaml
  ygo_search update

詳細は各コマンドのヘルプを参照してください:
  ygo_search card --help
  ygo_search faq --help
  ygo_search extract --help
  ygo_search replace --help
  ygo_search bulk --help
  ygo_search convert --help
`);
}
// card サブコマンド（旧 ygo_search）
function handleCardCommand(args) {
    // Handle columns subcommand
    if (args.length > 0 && (args[0] === 'columns' || args[0] === '--columns')) {
        showColumns();
        process.exit(0);
    }
    // Handle help
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_search card [command] [options]

Yu-Gi-Oh カードデータベース検索

Commands:
  columns               利用可能な全カラムとその説明を表示
  (no command)          カード検索（デフォルト）

Filter Options (at least one required):
  --name <value>            カード名フィルタ
  --text <value>            カードテキストフィルタ
  --cardId <value>          カードIDフィルタ（カンマ区切りまたはJSON配列）
  --cardType <value>        カード種別フィルタ（monster, spell, trap）
  --race <value>            種族フィルタ（dragon, warrior, etc.）
  --attribute <value>       属性フィルタ（LIGHT, DARK, etc.）
  --atk <value>             攻撃力フィルタ
  --def <value>             守備力フィルタ
  --level <value>           レベルフィルタ
  --levelValue <value>      レベル値フィルタ（数値）
  --pendulumScale <value>   ペンデュラムスケールフィルタ
  --ruby <value>            読み仮名フィルタ
  --linkValue <value>       リンク値フィルタ
  --linkArrows <value>      リンクマーカーフィルタ
  --monsterTypes <value>    モンスタータイプ（JSON配列形式、例: '["effect","fusion"]' またはカンマ区切り）

Output Options:
  --cols <col1,col2,...>    返却するカラム（カンマ区切り）
  --max <N>                 最大結果数（デフォルト: 100）
  --sort <field[:order]>    ソートフィールド（order: asc|desc）
                            Fields: cardId, name, ruby, atk, def, levelValue, etc.
  --raw                     Raw 出力モード（警告を抑制）

Search Options:
  --mode <exact|partial>    検索モード（デフォルト: exact）
  --flagAllowWild <bool>    ワイルドカード検索を有効化 (*) （デフォルト: true）
  --flagAutoModify <bool>   一致のためにテキストを正規化（デフォルト: true）
  --flagNearly <bool>       タイプミスの曖昧一致（デフォルト: false）
  --includeRuby <bool>      名前検索時に読み仮名フィールドも検索（デフォルト: true）
  --flagAutoPend <bool>     ペンデュラムテキストを自動含める（デフォルト: true）
  --flagAutoSupply <bool>   補足情報を自動含める（デフォルト: true）
  --flagAutoRuby <bool>     読み仮名を自動含める（デフォルト: true）

Alternative Formats:
  全てのオプションは key=value 形式でも指定可能:
  name=青眼 text=*破壊* cols=name,cardId max=50 sort=atk:desc

  または JSON 形式:
  ygo_search card '{"name":"青眼"}' cols=name,cardId

Examples:

Subcommands:
  ygo_search card columns

Basic Searches:
  ygo_search card --name "青眼の白龍"
  ygo_search card --name "青眼の白龍" --cols name,cardId,text
  ygo_search card --cardType trap --sort name --cols name,text

Advanced Filtering:
  ygo_search card --text "*破壊*" --max 50 --sort atk:desc
  ygo_search card --race dragon --atk 3000 --sort levelValue:asc --cols name,atk,def,race

Array Parameters:
  ygo_search card --cardId 19723,21820,21207 --cols name,cardId
  ygo_search card --monsterTypes '["effect","fusion"]' --cols name

Alternative Formats:
  ygo_search card name=青眼の白龍 cols=name,cardId,text
  ygo_search card '{"name":"青眼の白龍"}' cols=name,cardId,text
`);
        process.exit(0);
    }
    const scriptPath = path.join(__dirname, '..', 'search-cards.js');
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
// bulk サブコマンド（旧 ygo_bulk_search）
function handleBulkCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_search bulk <queries> [options]

複数のカード検索クエリを一括実行します。

Arguments:
  queries               JSON配列形式のクエリリスト

Examples:
  ygo_search bulk '[{"name":"青眼"},{"name":"ブラック・マジシャン"}]'
  ygo_search bulk '{"name":"青眼"}' '{"name":"ブラック・マジシャン"}'
`);
        process.exit(0);
    }
    const bulkScriptPath = path.join(__dirname, '..', 'bulk-search-cards.js');
    const proc = spawn('node', [
        bulkScriptPath,
        ...args
    ], {
        stdio: 'inherit'
    });
    proc.on('exit', (code)=>{
        process.exit(code || 0);
    });
}
// convert サブコマンド（旧 ygo_convert）
function handleConvertCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_search convert <input:output> [<input:output> ...]

JSON、JSONL、JSONC、YAMLフォーマット間の変換を行います。

Arguments:
  input:output          入力ファイルと出力ファイルのパスを':'で区切る
                        フォーマットは拡張子から自動検出

Supported formats:
  .json                 標準JSON
  .jsonl                JSON Lines（1行に1つのJSONオブジェクト）
  .jsonc                コメント付きJSON
  .yaml, .yml           YAML

Examples:
  ygo_search convert input.json:output.jsonl
  ygo_search convert data.yaml:output.json
  ygo_search convert a.json:a.yaml b.jsonl:b.json
`);
        process.exit(0);
    }
    const convertScriptPath = path.join(__dirname, '..', 'format-converter.js');
    const proc = spawn('node', [
        convertScriptPath,
        ...args
    ], {
        stdio: 'inherit'
    });
    proc.on('exit', (code)=>{
        process.exit(code || 0);
    });
}
// faq サブコマンド（旧 ygo_faq_search）
function handleFaqCommand(args) {
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`Usage: ygo_search faq <params> [options]

FAQ データベースを様々な条件で検索

Parameters (key=value style):
  faqId=N               - FAQ ID で検索
  cardId=N              - カード ID で検索（このカードを参照する FAQ を検索）
  cardName="name"       - カード名で検索（ワイルドカード * 対応）
  cardFilter.key=value  - カードスペックで検索（例: cardFilter.race=dragon）
  question="text"       - 質問テキストで検索（ワイルドカード対応）
  answer="text"         - 回答テキストで検索（ワイルドカード対応）
  limit=N               - 最大結果数（デフォルト: 50）

Output Options:
  --fcol a,b,c          - FAQ カラム（faqId,question,answer,updatedAt）
  --col a,b,c           - カードカラム（cardId,name,atk,def,race,text,etc.）
  --format FORMAT       - 出力形式: json|csv|tsv|jsonl（デフォルト: json）
  --random              - 結果からランダムに選択
  --range start-end     - FAQ ID 範囲でフィルタ
  --all                 - 全結果を返す（--range と併用）

Examples (key=value style):
  ygo_search faq faqId=100
  ygo_search faq cardId=6808 limit=5
  ygo_search faq cardName="青眼*" --fcol faqId,question
  ygo_search faq cardFilter.race=dragon cardFilter.levelValue=8
  ygo_search faq question="*融合*" --format csv
  ygo_search faq answer="*無効*" --col name,text

Examples (JSON style - still supported):
  ygo_search faq '{"faqId":10}'
  ygo_search faq '{"cardId":6808,"limit":5}' --fcol faqId,question
  ygo_search faq '{"cardName":"青眼*"}' --format csv
  ygo_search faq '{"cardFilter":{"race":"dragon","levelValue":"8"}}'
`);
        process.exit(0);
    }
    const scriptPath = path.join(__dirname, '..', 'search-faq.js');
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
// extract サブコマンド（旧 ygo_extract）
async function handleExtractCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_search extract <text> [options]

カード名パターンをテキストから抽出して検索します。

Arguments:
  text                テキスト（カード名パターンを含む）

Options:
  cols=col1,col2      返却するカラム（カンマ区切り）

Pattern Types:
  {card-name}         柔軟な検索（ワイルドカード * 対応）
  《card-name》        完全一致検索
  {{name|cardId}}     カードID で検索

Examples:
  ygo_search extract "{青眼の白龍}と{ブラック・マジシャン}を召喚"
  ygo_search extract "{青眼の白龍}で攻撃" cols=name,cardId,atk
  ygo_search extract "{ブルーアイズ*}を召喚"
`);
        process.exit(0);
    }
    const text = args[0];
    const cards = await extractAndSearchCards(text);
    console.log(JSON.stringify({
        cards
    }, null, 2));
}
// replace サブコマンド（旧 ygo_replace）
async function handleReplaceCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_search replace <text> [options]

カード名パターンをテキストから抽出し、検索して検証済みパターンに置換します。

Arguments:
  text                カード名パターンを含むテキスト

Options:
  --raw               processedText のみを出力（JSON なし）
  --mount-par         《公式カード名》形式で置換

Pattern Types:
  {card-name}         柔軟な検索（ワイルドカード対応）
  《card-name》        完全一致検索
  {{name|cardId}}     カードID で検索

Examples:
  ygo_search replace "{青眼の白龍}を召喚して攻撃"
    # => {"processedText":"{{青眼の白龍|4007}}を召喚して攻撃",...}
  ygo_search replace "{青眼*}を召喚"
    # => 複数候補: {{青眼の白龍|4007}}, {{青眼の亜白龍|12253}}, ...
  ygo_search replace "《青眼の白龍》を召喚" --mount-par
    # => 《青眼の白龍》を召喚（完全一致、そのまま維持）
`);
        process.exit(0);
    }
    const rawMode = args.includes('--raw');
    const mountParMode = args.includes('--mount-par');
    const text = args.filter((arg)=>!arg.startsWith('--'))[0];
    if (!text) {
        console.error('Error: No text provided');
        process.exit(2);
    }
    const result = await judgeAndReplace(text, {
        mountPar: mountParMode
    });
    if (rawMode) {
        console.log(result.processedText);
    } else {
        console.log(JSON.stringify(result));
    }
}
// seek サブコマンド（旧 ygo_seek）
function handleSeekCommand(args) {
    const scriptPath = path.join(__dirname, '..', 'ygo-seek.js');
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
// vector サブコマンド
async function handleVectorCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_search vector <subcommand> [options]

Vector DB管理コマンド

Subcommands:
  setup [type]          Vector DBインデックスを構築（cards/faqs）
                        type: cards, faqs, all (デフォルト: all)
                        Options:
                          --keep-tmp    一時JSONLファイルを削除せずに保持
  setup-generic <files...> --table <name>
                        汎用データをインポート
                        files: yaml/jsonl/json/tsv/csv（複数指定可、glob対応）
                        Options:
                          --table <name>  テーブル名（必須）
                          --exclude-columns col1,col2
                          --include-columns col1,col2
                          --keep-tmp
  search <query>        Vector検索を実行

Examples:
  ygo_search vector setup                全てのインデックスを構築
  ygo_search vector setup cards          カードのみ
  ygo_search vector setup faqs           FAQのみ
  ygo_search vector setup --keep-tmp     一時ファイルを保持
  ygo_search vector setup-generic rules.yml --table rules --exclude-columns cite
  ygo_search vector setup-generic aa/*.yml bb/data.yml --table rules
  ygo_search vector search "墓地から特殊召喚" --limit 5
  ygo_search vector search "融合召喚" --type cards --threshold 0.8
`);
        process.exit(0);
    }
    const subcommand = args[0];
    const subArgs = args.slice(1);
    if (subcommand === 'setup') {
        await handleVectorSetupCommand(subArgs);
    } else if (subcommand === 'setup-generic') {
        await handleVectorSetupGenericCommand(subArgs);
    } else if (subcommand === 'search') {
        await handleVectorSearchCommand(subArgs);
    } else {
        console.error(`Unknown vector subcommand: ${subcommand}`);
        process.exit(1);
    }
}
async function handleVectorSetupCommand(args) {
    const { convertCardsToJsonl, convertFaqsToJsonl } = await import('../lib/vector/converter.js');
    const { indexFromJsonl } = await import('../lib/vector/indexer.js');
    const fs = await import('fs/promises');
    // オプション解析
    let type = 'all';
    let keepTmp = false;
    for(let i = 0; i < args.length; i++){
        const arg = args[i];
        if (arg === '--keep-tmp') {
            keepTmp = true;
        } else if (!arg.startsWith('--')) {
            type = arg;
        }
    }
    if (![
        'cards',
        'faqs',
        'all'
    ].includes(type)) {
        console.error(`Invalid type: ${type}. Must be one of: cards, faqs, all`);
        process.exit(1);
    }
    // tmpファイルのパスを保持
    const tmpFiles = [];
    // SIGINT対応
    const { interrupted } = setupInterruptHandler();
    try {
        // 一時ディレクトリ作成
        const tmpDir = getTmpDir();
        await fs.mkdir(tmpDir, {
            recursive: true
        });
        if (type === 'all' || type === 'cards') {
            if (interrupted) return;
            console.error('\n=== Cards のインデックス構築 ===');
            const cardsTsvPath = getTsvPath('cards-all.tsv');
            const detailTsvPath = getTsvPath('detail-all.tsv');
            const cardsJsonlPath = getTmpPath('cards_for_vectordb.jsonl');
            tmpFiles.push(cardsJsonlPath);
            console.error('TSVからJSONLに変換中...');
            const cardsCount = await convertCardsToJsonl(cardsTsvPath, detailTsvPath, cardsJsonlPath);
            console.error(`${cardsCount}件のカードを変換しました`);
            console.error('Vector DBインデックスを構築中...');
            await indexFromJsonl('cards', cardsJsonlPath);
        }
        if (type === 'all' || type === 'faqs') {
            if (interrupted) return;
            console.error('\n=== FAQs のインデックス構築 ===');
            const faqsTsvPath = getTsvPath('faq-all.tsv');
            const faqsJsonlPath = getTmpPath('faqs_for_vectordb.jsonl');
            tmpFiles.push(faqsJsonlPath);
            console.error('TSVからJSONLに変換中...');
            const faqsCount = await convertFaqsToJsonl(faqsTsvPath, faqsJsonlPath);
            console.error(`${faqsCount}件のFAQを変換しました`);
            console.error('Vector DBインデックスを構築中...');
            await indexFromJsonl('faqs', faqsJsonlPath);
        }
        console.error('\n全てのインデックス構築が完了しました');
        // tmpファイルのクリーンアップ
        if (!keepTmp && tmpFiles.length > 0) {
            console.error('\n一時ファイルをクリーンアップ中...');
            for (const tmpFile of tmpFiles){
                try {
                    await fs.unlink(tmpFile);
                    console.error(`削除: ${tmpFile}`);
                } catch (e) {
                    if (e.code !== 'ENOENT') {
                        console.error(`警告: ${tmpFile} の削除に失敗しました:`, e.message);
                    }
                }
            }
            console.error('クリーンアップ完了');
        } else if (keepTmp) {
            console.error('\n--keep-tmpオプションが指定されているため、一時ファイルを保持します');
        }
    } catch (error) {
        console.error('インデックス構築中にエラーが発生しました:', error.message);
        process.exit(1);
    }
}
async function handleVectorSearchCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_search vector search <query> [options]

Vector検索を実行

Arguments:
  query                 検索クエリ

Options:
  --type TYPE           検索対象（cards/faqs/all/カスタムテーブル名, デフォルト: all）
  --limit N             最大結果数（デフォルト: 10）
  --threshold N         スコア閾値（0.0-1.0, 小さいほど厳密）
  --distance TYPE       距離メトリック（cosine/l2/dot, デフォルト: cosine）
  --format FORMAT       出力形式（json/csv/tsv/jsonl, デフォルト: json）

Examples:
  ygo_search vector search "墓地から特殊召喚"
  ygo_search vector search "融合召喚" --type cards --limit 5
  ygo_search vector search "カウンター罠" --threshold 0.7
  ygo_search vector search "チェーンブロック" --format jsonl
  ygo_search vector search "特殊召喚" --type test
`);
        process.exit(0);
    }
    const query = args[0];
    if (!query) {
        console.error('Error: クエリを指定してください');
        process.exit(1);
    }
    const { searchCards, searchFaqs, searchAll, searchTable } = await import('../lib/vector/searcher.js');
    // オプション解析
    let type = 'all';
    let limit = 10;
    let threshold = undefined;
    let distanceType = 'cosine';
    let format = 'json';
    for(let i = 1; i < args.length; i++){
        if (args[i] === '--type' && i + 1 < args.length) {
            type = args[++i];
        } else if (args[i] === '--limit' && i + 1 < args.length) {
            limit = parseInt(args[++i], 10);
        } else if (args[i] === '--threshold' && i + 1 < args.length) {
            threshold = parseFloat(args[++i]);
        } else if (args[i] === '--distance' && i + 1 < args.length) {
            distanceType = args[++i];
        } else if (args[i] === '--format' && i + 1 < args.length) {
            format = args[++i];
        }
    }
    const options = {
        limit,
        threshold,
        distanceType
    };
    try {
        console.error(`検索中: "${query}"\n`);
        let results;
        if (type === 'cards') {
            const cards = await searchCards(query, options);
            results = {
                cards
            };
        } else if (type === 'faqs') {
            const faqs = await searchFaqs(query, options);
            results = {
                faqs
            };
        } else if (type === 'all') {
            results = await searchAll(query, options);
        } else {
            // カスタムテーブルの検索
            const customResults = await searchTable(type, query, options);
            results = {
                [type]: customResults
            };
        }
        // フォーマット出力
        if (format === 'json') {
            console.log(JSON.stringify(results, null, 2));
        } else if (format === 'jsonl') {
            // 全ての結果を配列に集める
            const allResults = Object.values(results).flat();
            for (const r of allResults){
                console.log(JSON.stringify(r));
            }
        } else if (format === 'csv' || format === 'tsv') {
            const sep = format === 'csv' ? ',' : '\t';
            // 全ての結果を配列に集める
            const allResults = Object.values(results).flat();
            if (allResults.length > 0) {
                console.log([
                    'id',
                    'score',
                    'text_preview'
                ].join(sep));
                for (const r of allResults){
                    const textPreview = r.text.substring(0, 100).replace(/\n/g, ' ').replace(/"/g, '""');
                    console.log([
                        r.id,
                        r.score.toFixed(4),
                        `"${textPreview}..."`
                    ].join(sep));
                }
            }
        }
    } catch (error) {
        console.error('検索エラー:', error.message);
        process.exit(1);
    }
}
async function handleVectorSetupGenericCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_search vector setup-generic <files...> --table <tableName> [options]

汎用データからVector DBインデックスを構築

Arguments:
  files...              入力ファイル（yaml/jsonl/json/tsv/csv）
                        複数ファイル指定可、シェルのglob展開に対応

Options:
  --table <name>               テーブル名（必須）
  --exclude-columns col1,col2  指定カラムをテキストから除外
  --include-columns col1,col2  指定カラムのみテキストに含める
  --keep-tmp                   一時JSONLファイルを削除せずに保持

Required fields: id, title, text

Examples:
  ygo_search vector setup-generic rules.yml --table rules
  ygo_search vector setup-generic aa/*.yml bb/data.yml --table rules --exclude-columns cite
  ygo_search vector setup-generic data.json --table custom --include-columns category,priority
`);
        process.exit(0);
    }
    const { convertGenericToJsonl } = await import('../lib/vector/converter.js');
    const { indexFromJsonl } = await import('../lib/vector/indexer.js');
    const fs = await import('fs/promises');
    // オプション解析
    let tableName = undefined;
    let excludeColumns = undefined;
    let includeColumns = undefined;
    let keepTmp = false;
    const inputFiles = [];
    for(let i = 0; i < args.length; i++){
        if (args[i] === '--table' && i + 1 < args.length) {
            tableName = args[++i];
        } else if (args[i] === '--exclude-columns' && i + 1 < args.length) {
            excludeColumns = args[++i].split(',').map((c)=>c.trim());
        } else if (args[i] === '--include-columns' && i + 1 < args.length) {
            includeColumns = args[++i].split(',').map((c)=>c.trim());
        } else if (args[i] === '--keep-tmp') {
            keepTmp = true;
        } else if (!args[i].startsWith('--')) {
            inputFiles.push(args[i]);
        }
    }
    // バリデーション
    if (!tableName) {
        console.error('Error: --table オプションは必須です');
        process.exit(1);
    }
    if (inputFiles.length === 0) {
        console.error('Error: 入力ファイルを指定してください');
        process.exit(1);
    }
    // Validate exclusivity
    if (excludeColumns && includeColumns) {
        console.error('Error: Cannot specify both --exclude-columns and --include-columns');
        process.exit(1);
    }
    const tmpFiles = [];
    // SIGINT対応
    const { interrupted } = setupInterruptHandler();
    try {
        // 一時ディレクトリ作成
        const tmpDir = getTmpDir();
        await fs.mkdir(tmpDir, {
            recursive: true
        });
        console.error(`\n=== ${tableName} のインデックス構築 ===`);
        const jsonlPath = getTmpPath(`${tableName}_for_vectordb.jsonl`);
        tmpFiles.push(jsonlPath);
        // 既存のJSONLファイルを削除（追記モードのため）
        try {
            await fs.unlink(jsonlPath);
        } catch (e) {
            if (e.code !== 'ENOENT') throw e;
        }
        const options = excludeColumns ? {
            excludeColumns
        } : includeColumns ? {
            includeColumns
        } : undefined;
        let totalCount = 0;
        for (const inputFile of inputFiles){
            console.error(`${inputFile} からJSONLに変換中...`);
            // 一時ファイルに変換してから追記
            const tempJsonlPath = getTmpPath(`${tableName}_temp.jsonl`);
            tmpFiles.push(tempJsonlPath); // クリーンアップリストに追加
            const count = await convertGenericToJsonl(inputFile, tempJsonlPath, options);
            console.error(`  ${count}件のレコードを変換しました`);
            totalCount += count;
            // メインのJSONLファイルに追記
            const tempContent = await fs.readFile(tempJsonlPath, 'utf-8');
            await fs.appendFile(jsonlPath, tempContent);
        // 一時ファイルは関数の最後でまとめて削除するため、ここではunlinkしない
        }
        console.error(`合計 ${totalCount}件のレコードを変換しました`);
        console.error('Vector DBインデックスを構築中...');
        await indexFromJsonl(tableName, jsonlPath);
        console.error('\nインデックス構築が完了しました');
        // tmpファイルのクリーンアップ
        if (!keepTmp && tmpFiles.length > 0) {
            console.error('\n一時ファイルをクリーンアップ中...');
            for (const tmpFile of tmpFiles){
                try {
                    await fs.unlink(tmpFile);
                    console.error(`削除: ${tmpFile}`);
                } catch (e) {
                    if (e.code !== 'ENOENT') {
                        console.error(`警告: ${tmpFile} の削除に失敗しました:`, e.message);
                    }
                }
            }
            console.error('クリーンアップ完了');
        } else if (keepTmp) {
            console.error('\n--keep-tmpオプションが指定されているため、一時ファイルを保持します');
        }
    } catch (error) {
        console.error('インデックス構築中にエラーが発生しました:', error.message);
        process.exit(1);
    }
}
// update サブコマンド（旧 ygo_update_search）
function handleUpdateCommand() {
    const scriptPath = path.join(__dirname, 'ygo_update_search.js');
    const proc = spawn('node', [
        scriptPath
    ], {
        stdio: 'inherit'
    });
    proc.on('exit', (code)=>{
        process.exit(code || 0);
    });
}
// docs サブコマンド - APIドキュメント参照
async function handleDocsCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_search docs [name]

APIドキュメント参照

Arguments:
  [name]                  Show documentation for a function, interface, or type
  list                    List all available documentation

Examples:
  ygo_search docs searchCards    Show searchCards function documentation
  ygo_search docs Card           Show Card interface documentation
  ygo_search docs list           List all available items

Note: If documentation is not found, run 'bun run docs' to generate it.
`);
        process.exit(0);
    }
    const DOCS_DIR = path.join(__dirname, '..', '..', 'docs', 'api');
    const entries = await findDocs(DOCS_DIR);
    if (args[0] === 'list') {
        await listDocs(entries);
        return;
    }
    const query = args[0];
    const found = findDocByName(entries, query);
    if (found) {
        try {
            await showDoc(found.path);
        } catch (err) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }
    } else {
        console.error(`Error: Documentation for '${query}' not found.`);
        console.error('\nAvailable items:');
        console.error(entries.map((e)=>`  - ${e.name}`).join('\n'));
        console.error('\nRun "ygo_search docs list" to see all available documentation.');
        process.exit(1);
    }
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
        showHelp();
        process.exit(0);
    }
    const command = args[0];
    const commandArgs = args.slice(1);
    switch(command){
        case 'card':
            handleCardCommand(commandArgs);
            break;
        case 'faq':
            handleFaqCommand(commandArgs);
            break;
        case 'extract':
            await handleExtractCommand(commandArgs);
            break;
        case 'replace':
            await handleReplaceCommand(commandArgs);
            break;
        case 'seek':
            handleSeekCommand(commandArgs);
            break;
        case 'bulk':
            handleBulkCommand(commandArgs);
            break;
        case 'convert':
            handleConvertCommand(commandArgs);
            break;
        case 'vector':
            await handleVectorCommand(commandArgs);
            break;
        case 'docs':
            await handleDocsCommand(commandArgs);
            break;
        case 'update':
            handleUpdateCommand();
            break;
        default:
            // コマンドがサブコマンドでない場合、card コマンドとして扱う（後方互換性）
            handleCardCommand(args);
            break;
    }
}
main().catch((err)=>{
    console.error('Error:', err.message);
    process.exit(1);
});
