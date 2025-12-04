# データスキーマ定義

このドキュメントは Yu-Gi-Oh! カードデータベースのスキーマと各カラムの定義を説明します。

## ファイル構成

### cards-all.tsv
基本的なカード情報を含むメインファイル

### detail-all.tsv  
追加の詳細情報（補足情報など）

## データ形式

- **形式**: TSV (Tab-Separated Values)
- **エンコーディング**: UTF-8
- **1行目**: カラムヘッダー
- **2行目以降**: カードデータ

---

## カラム定義 (cards-all.tsv)

### 基本情報

#### cardType
- **型**: string (enum)
- **説明**: カードの種類
- **必須**: Yes
- **値**:
  - `monster` - モンスターカード
  - `spell` - 魔法カード  
  - `trap` - 罠カード

#### name
- **型**: string
- **説明**: カードの正式名称
- **必須**: Yes
- **例**: `青眼の白龍`, `ブラック・マジシャン`

#### nameModified
- **型**: string
- **説明**: 検索用に正規化された名前（空白・記号除去、ひらがな→カタカナ変換、竜→龍変換済み）
- **必須**: Yes
- **用途**: 高速な名前検索に使用（flagAutoModify=true時に使用）
- **正規化ルール**:
  - 空白・記号（・★☆など）を除去
  - ひらがな→カタカナに変換
  - 全角英数→半角英数に変換
  - 小文字に変換
  - 漢字異体字を統一（竜→龍）
- **例**: 
  - `青眼の白龍` → `青眼ノ白龍`
  - `アシスト★ヤミー！` → `アシストヤミー`
  - `佚楽の堕天使` → `佚楽ノ堕天使`

#### ruby
- **型**: string
- **説明**: カード名の読み仮名
- **必須**: No
- **例**: `ブルーアイズ・ホワイト・ドラゴン`

#### cardId
- **型**: string
- **説明**: カードの一意識別子
- **必須**: Yes
- **例**: `4007`, `5053`

#### ciid
- **型**: string  
- **説明**: 追加の識別子（詳細不明）
- **必須**: No

#### imgs
- **型**: string (JSON array)
- **説明**: カード画像のURL配列
- **必須**: No
- **形式**: `["url1", "url2"]`

---

### テキスト情報

#### text
- **型**: string
- **説明**: カードの効果テキスト
- **必須**: No (一部のカードには効果テキストがない)
- **検索**: ワイルドカード(`*`)とマイナス検索(`-"phrase"`)をサポート

---

### モンスター固有フィールド

#### attribute
- **型**: string (enum)
- **説明**: モンスターの属性
- **適用**: cardType = "monster" の場合のみ
- **値**:
  - `dark` - 闇
  - `divine` - 神
  - `earth` - 地
  - `fire` - 炎
  - `light` - 光
  - `water` - 水
  - `wind` - 風

#### levelType
- **型**: string (enum)
- **説明**: レベル/ランク/リンクの種類
- **適用**: cardType = "monster" の場合のみ
- **値**:
  - `level` - レベル（通常・効果・儀式モンスター）
  - `rank` - ランク（エクシーズモンスター）
  - `link` - リンク（リンクモンスター）

#### levelValue
- **型**: string (数字)
- **説明**: レベル/ランク/リンクの値
- **適用**: cardType = "monster" の場合のみ
- **範囲**: `0` ～ `13` (通常), `0` ～ `8` (リンク)

#### race
- **型**: string (enum)
- **説明**: モンスターの種族
- **適用**: cardType = "monster" の場合のみ
- **値**:
  - `aqua` - 水族
  - `beast` - 獣族
  - `beastwarrior` - 獣戦士族
  - `creatorgod` - 創造神族
  - `cyberse` - サイバース族
  - `dinosaur` - 恐竜族
  - `divine` - 幻神獣族
  - `dragon` - ドラゴン族
  - `fairy` - 天使族
  - `fiend` - 悪魔族
  - `fish` - 魚族
  - `illusion` - 幻竜族
  - `insect` - 昆虫族
  - `machine` - 機械族
  - `plant` - 植物族
  - `psychic` - サイキック族
  - `pyro` - 炎族
  - `reptile` - 爬虫類族
  - `rock` - 岩石族
  - `seaserpent` - 海竜族
  - `spellcaster` - 魔法使い族
  - `thunder` - 雷族
  - `warrior` - 戦士族
  - `windbeast` - 鳥獣族
  - `wyrm` - 幻竜族
  - `zombie` - アンデット族

#### monsterTypes
- **型**: string (JSON array)
- **説明**: モンスターの種類（複数指定可能）
- **適用**: cardType = "monster" の場合のみ
- **形式**: `["type1", "type2"]`
- **値**:
  - `normal` - 通常
  - `effect` - 効果
  - `fusion` - 融合
  - `ritual` - 儀式
  - `synchro` - シンクロ
  - `xyz` - エクシーズ
  - `link` - リンク
  - `pendulum` - ペンデュラム
  - `tuner` - チューナー
  - `spirit` - スピリット
  - `union` - ユニオン
  - `gemini` - デュアル
  - `flip` - リバース
  - `toon` - トゥーン
  - `special` - 特殊召喚

#### atk
- **型**: string (数字 or "?")
- **説明**: 攻撃力
- **適用**: cardType = "monster" の場合のみ
- **例**: `3000`, `2500`, `?`

#### def
- **型**: string (数字 or "?")
- **説明**: 守備力
- **適用**: cardType = "monster" の場合のみ（リンクモンスターを除く）
- **例**: `2500`, `2100`, `?`

#### linkMarkers
- **型**: string (JSON array)
- **説明**: リンクマーカーの位置
- **適用**: monsterTypes に "link" を含む場合のみ
- **形式**: `["top", "bottom-left", "bottom-right"]`
- **値**: `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, `bottom-right`

#### pendulumScale
- **型**: string (数字)
- **説明**: ペンデュラムスケール
- **適用**: monsterTypes に "pendulum" を含む場合のみ
- **範囲**: `0` ～ `13`

#### pendulumText
- **型**: string
- **説明**: ペンデュラム効果のテキスト
- **適用**: monsterTypes に "pendulum" を含む場合のみ
- **検索**: ワイルドカード(`*`)とマイナス検索(`-"phrase"`)をサポート

#### isExtraDeck
- **型**: boolean (string)
- **説明**: エクストラデッキに入るカードかどうか
- **適用**: cardType = "monster" の場合のみ
- **値**: `true` or 空文字列(false)
- **該当**: 融合・シンクロ・エクシーズ・リンクモンスター

---

### 魔法カード固有フィールド

#### spellEffectType
- **型**: string (enum)
- **説明**: 魔法カードの種類
- **適用**: cardType = "spell" の場合のみ
- **値**:
  - `normal` - 通常
  - `quick` - 速攻
  - `continuous` - 永続
  - `equip` - 装備
  - `field` - フィールド
  - `ritual` - 儀式

---

### 罠カード固有フィールド

#### trapEffectType
- **型**: string (enum)
- **説明**: 罠カードの種類
- **適用**: cardType = "trap" の場合のみ
- **値**:
  - `normal` - 通常
  - `continuous` - 永続
  - `counter` - カウンター

---

## カラム定義 (detail-all.tsv)

### cardId
- **型**: string
- **説明**: cards-all.tsv との結合キー
- **必須**: Yes

### cardName
- **型**: string
- **説明**: カード名（参照用）
- **必須**: Yes

### supplementInfo
- **型**: string
- **説明**: カード効果の補足情報
- **必須**: No
- **検索**: ワイルドカード(`*`)とマイナス検索(`-"phrase"`)をサポート

### supplementDate
- **型**: string (ISO date)
- **説明**: 補足情報の更新日
- **必須**: No
- **形式**: `YYYY-MM-DD`

### pendulumSupplementInfo
- **型**: string
- **説明**: ペンデュラム効果の補足情報
- **必須**: No
- **検索**: ワイルドカード(`*`)とマイナス検索(`-"phrase"`)をサポート

### pendulumSupplementDate
- **型**: string (ISO date)
- **説明**: ペンデュラム補足情報の更新日
- **必須**: No
- **形式**: `YYYY-MM-DD`

---

## 検索機能

### ワイルドカード検索
以下のフィールドで `*` をワイルドカードとして使用可能:
- `name` (flagAllowWild=true の場合)
- `text`
- `pendulumText`
- `supplementInfo`
- `pendulumSupplementInfo`

**例**:
```json
{"name": "ブルーアイズ*"}
{"text": "*destroy*monster*"}
```

### マイナス検索
以下のフィールドで `-"phrase"` で除外検索が可能:
- `name`
- `text`
- `pendulumText`
- `supplementInfo`
- `pendulumSupplementInfo`

**構文**:
- `(先頭|半角空白|全角空白)-"phrase"`
- `-'phrase'`  
- `-\`phrase\``

**例**:
```json
{"text": "destroy -\"negate\""}
{"text": "*summon* -\"hand\" -\"deck\""}
```

---

## 使用例

### カウンター罠で「無効」を含まないカードを検索
```bash
npx tsx src/search-cards.ts '{"trapEffectType":"counter","text":"-\"無効\""}' cols=name,cardId,text
```

### 光属性ドラゴン族で攻撃力3000以上
```bash
npx tsx src/search-cards.ts '{"attribute":"light","race":"dragon","atk":"3000"}' cols=name,atk,def
```

### ペンデュラムモンスターでスケール8
```bash
npx tsx src/search-cards.ts '{"monsterTypes":"pendulum","pendulumScale":"8"}' cols=name,pendulumScale,pendulumText
```

---

## 注意事項

1. **JSON配列フィールド** (`imgs`, `monsterTypes`, `linkMarkers`) は文字列として保存されており、検索時はJSON.parseが必要
2. **空文字列** は値なし(null/undefined)を表す
3. **数値フィールド** (`atk`, `def`, `levelValue`, `pendulumScale`) も文字列型で保存
4. **正規化検索** (flagAutoModify=true) は `name` フィールドのみ適用可能
5. **部分一致** (mode=partial) は `name` フィールドのみ使用可能
