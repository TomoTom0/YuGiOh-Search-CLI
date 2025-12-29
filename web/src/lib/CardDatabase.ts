/**
 * ブラウザ専用CardDatabaseクラス
 * IndexedDBとfetchを使用してカードデータを管理
 */

import { openDB, type IDBPDatabase } from 'idb'
import { parseSearchQuery } from '../../../src/lib/shared/search-parser.js'
import { valueMatches } from '../../../src/lib/shared/normalizer.js'
import type { Card, SearchParams } from './types.js'

const DB_NAME = 'YuGiOhCardDB'
const DB_VERSION = 1
const STORE_NAME = 'cards'
const DATA_VERSION = 2 // 改行コード処理の修正: v1 -> v2

interface NormalizedFilter {
  op: 'and' | 'or'
  cond: any[]
}

/**
 * カードデータベースクラス
 *
 * ブラウザ環境でカード検索を実行するためのデータベースクラスです。
 * 初回ロード時にバックグラウンドでTSVファイルをプリロードし、
 * IndexedDBにキャッシュして高速な検索を実現します。
 */
export class CardDatabase {
  private db: IDBPDatabase | null = null
  private cards: Card[] = []
  private headers: string[] = []
  private isLoading = false
  private loadPromise: Promise<void> | null = null

  constructor() {
    this.initBackgroundPreload()
  }

  /**
   * バックグラウンドプリロードを開始
   * requestIdleCallbackを使用してメインスレッドをブロックしない
   */
  private initBackgroundPreload(): void {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        this.load()
      })
    } else {
      setTimeout(() => {
        this.load()
      }, 0)
    }
  }

  /**
   * データをロードする
   * IndexedDBキャッシュがあれば使用し、なければfetchでダウンロード
   */
  async load(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise
    }

    this.isLoading = true
    this.loadPromise = this.performLoad()

    try {
      await this.loadPromise
    } finally {
      this.isLoading = false
    }
  }

  private async performLoad(): Promise<void> {
    // IndexedDBを開く
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
    })

    // キャッシュチェック
    const cachedData = await this.db.get(STORE_NAME, 'cards-data')
    if (cachedData && cachedData.version === DATA_VERSION) {
      this.cards = cachedData.cards
      this.headers = cachedData.headers
      console.log(`Loaded ${this.cards.length} cards from IndexedDB cache (v${DATA_VERSION})`)
      return
    }

    // バージョンが異なる、または存在しない場合
    if (cachedData) {
      console.log(`Cache version mismatch (cached: v${cachedData.version || 1}, current: v${DATA_VERSION}), reloading...`)
    }

    // fetchでTSVファイルをダウンロード
    const [cardsResponse, detailResponse] = await Promise.all([
      fetch('/data/tsv/cards-all.tsv'),
      fetch('/data/tsv/detail-all.tsv')
    ])

    if (!cardsResponse.ok) {
      throw new Error(`Failed to fetch cards-all.tsv: ${cardsResponse.statusText}`)
    }
    if (!detailResponse.ok) {
      throw new Error(`Failed to fetch detail-all.tsv: ${detailResponse.statusText}`)
    }

    const [cardsText, detailText] = await Promise.all([
      cardsResponse.text(),
      detailResponse.text()
    ])

    // cards-all.tsv を解析
    const cardsLines = cardsText.split('\n').filter(line => line.trim())
    if (cardsLines.length === 0) {
      throw new Error('cards-all.tsv is empty')
    }

    this.headers = cardsLines[0].split('\t')

    const cardsMap = new Map<string, Card>()
    for (let i = 1; i < cardsLines.length; i++) {
      const parts = cardsLines[i].split('\t')
      const card: any = {}

      for (let j = 0; j < this.headers.length; j++) {
        card[this.headers[j]] = parts[j] === undefined ? '' : parts[j]
      }

      cardsMap.set(card.cardId, card as Card)
    }

    // detail-all.tsv を解析してマージ
    const detailLines = detailText.split('\n').filter(line => line.trim())
    if (detailLines.length > 0) {
      const detailHeaders = detailLines[0].split('\t')
      for (let i = 1; i < detailLines.length; i++) {
        const parts = detailLines[i].split('\t')
        const cardId = parts[0]
        const card = cardsMap.get(cardId)

        if (card) {
          for (let j = 0; j < detailHeaders.length; j++) {
            card[detailHeaders[j]] = parts[j] === undefined ? '' : parts[j]
          }
        }
      }
    }

    this.cards = Array.from(cardsMap.values())
    console.log(`Loaded ${this.cards.length} cards from TSV`)

    // IndexedDBにキャッシュ (バージョン番号を含める)
    await this.db.put(STORE_NAME, { version: DATA_VERSION, cards: this.cards, headers: this.headers }, 'cards-data')
  }

  /**
   * カード検索を実行
   *
   * @param params 検索パラメータ
   * @returns マッチしたカードの配列
   */
  async search(params: SearchParams): Promise<Card[]> {
    // プリロード未完了の場合は待機
    if (!this.cards.length) {
      await this.load()
    }

    const {
      query,
      fields = ['all'],
      optionFilters,
      rangeFilters,
      filter: filterRaw,
      mode = 'exact',
      flagAutoModify = true,
      flagAllowWild = true,
      flagNearly = false,
      max = 100
    } = params

    // 検索クエリをパース
    const parsed = query ? parseSearchQuery(query) : null

    // フィルタを正規化（旧方式との互換性）
    const filter: Record<string, NormalizedFilter> = {}
    if (filterRaw) {
      for (const k of Object.keys(filterRaw)) {
        const v = filterRaw[k]
        if (v && typeof v === 'object' && (v.op || Array.isArray(v.cond) || v.cond)) {
          const op = v.op === 'or' ? 'or' : 'and'
          const cond = Array.isArray(v.cond) ? v.cond : (v.cond !== undefined ? [v.cond] : [])
          filter[k] = { op, cond }
        } else if (Array.isArray(v)) {
          filter[k] = { op: 'or', cond: v }
        } else {
          filter[k] = { op: 'and', cond: [v] }
        }
      }
    }

    // nameModifiedフィールドのインデックス
    const nameModifiedIndex = this.headers.indexOf('nameModified')

    // カードをフィルタリング
    const results: Card[] = []
    for (const card of this.cards) {
      let ok = true

      // 検索クエリフィルタ
      if (parsed) {
        // 検索対象フィールドを決定
        const searchFields = fields.includes('all')
          ? ['name', 'ruby', 'text', 'pendulumText', 'supplementInfo', 'pendulumSupplementInfo']
          : fields

        // 1. ネガティブ検索チェック（全フィールドを横断してチェック）
        // いずれかのフィールドにネガティブワードが含まれていたら除外
        let hasNegative = false
        for (const field of searchFields) {
          const text = card[field]
          if (typeof text === 'string') {
            for (const negWord of parsed.negative) {
              if (text.includes(negWord)) {
                hasNegative = true
                break
              }
            }
            if (hasNegative) break
          }
        }

        if (hasNegative) {
          ok = false
        } else {
          // 2. ポジティブ検索チェック（いずれかのフィールドでマッチすればOK）
          let matched = false
          for (const field of searchFields) {
            const text = card[field]
            if (typeof text === 'string') {
              // ネガティブチェックを除いた条件でマッチング
              let fieldMatched = true

              // フレーズ検索チェック
              for (const phrase of parsed.phrases) {
                if (!text.includes(phrase)) {
                  fieldMatched = false
                  break
                }
              }

              // 正規表現チェック
              if (fieldMatched) {
                for (const regexStr of parsed.regexes) {
                  try {
                    const regex = new RegExp(regexStr)
                    if (!regex.test(text)) {
                      fieldMatched = false
                      break
                    }
                  } catch {
                    fieldMatched = false
                    break
                  }
                }
              }

              // ポジティブワードチェック
              if (fieldMatched) {
                for (const word of parsed.positive) {
                  if (!text.includes(word)) {
                    fieldMatched = false
                    break
                  }
                }
              }

              if (fieldMatched) {
                matched = true
                break
              }
            }
          }

          if (!matched) {
            ok = false
          }
        }
      }

      // 選択肢フィルタ
      if (ok && optionFilters) {
        for (const [fieldName, selection] of Object.entries(optionFilters)) {
          if (!selection || (selection.positive.length === 0 && selection.negative.length === 0)) continue

          const cardValue = card[fieldName]
          let positiveMatched = true
          let negativeMatched = true

          // 肯定選択のチェック
          if (selection.positive.length > 0) {
            const matches: boolean[] = []

            if (fieldName === 'linkMarkers') {
              // linkMarkersは文字列連結形式（テンキー配置: 1-9の数字を連結）
              selection.positive.forEach(val => {
                const digit = val.split(':')[0]
                matches.push((cardValue || '').includes(digit))
              })
            } else if (fieldName === 'monsterTypes') {
              // monsterTypesはJSON配列
              try {
                const arrayValues = JSON.parse(cardValue || '[]')
                selection.positive.forEach(val => {
                  matches.push(arrayValues.includes(val))
                })
              } catch {
                matches.push(false)
              }
            } else {
              // その他のフィールドは単一値
              selection.positive.forEach(val => {
                matches.push(cardValue === val)
              })
            }

            // AND/OR判定
            if (selection.operator === 'or') {
              positiveMatched = matches.some(m => m)
            } else {
              positiveMatched = matches.every(m => m)
            }
          }

          // 否定選択のチェック（常にAND）
          if (selection.negative.length > 0) {
            const negativeMatches: boolean[] = []

            if (fieldName === 'linkMarkers') {
              selection.negative.forEach(val => {
                const digit = val.split(':')[0]
                negativeMatches.push((cardValue || '').includes(digit))
              })
            } else if (fieldName === 'monsterTypes') {
              try {
                const arrayValues = JSON.parse(cardValue || '[]')
                selection.negative.forEach(val => {
                  negativeMatches.push(arrayValues.includes(val))
                })
              } catch {
                negativeMatches.push(false)
              }
            } else {
              selection.negative.forEach(val => {
                negativeMatches.push(cardValue === val)
              })
            }

            // すべての否定値にマッチしないこと
            negativeMatched = negativeMatches.every(m => !m)
          }

          if (!positiveMatched || !negativeMatched) {
            ok = false
            break
          }
        }
      }

      // 数値範囲フィルタ
      if (ok && rangeFilters) {
        for (const [fieldName, range] of Object.entries(rangeFilters)) {
          if (!range || (range.min === undefined && range.max === undefined && range.exact === undefined && !range.questionMark)) continue

          const cardValue = card[fieldName]

          // ?チェック（攻撃力・守備力が"?"の場合）
          if (range.questionMark) {
            if (cardValue !== '?') {
              ok = false
              break
            }
            continue
          }

          const numValue = parseInt(cardValue, 10)

          // 数値に変換できない場合はスキップ
          if (isNaN(numValue)) {
            ok = false
            break
          }

          // 完全一致チェック
          if (range.exact !== undefined) {
            if (numValue !== range.exact) {
              ok = false
              break
            }
            continue
          }

          // 範囲チェック
          if (range.min !== undefined && numValue < range.min) {
            ok = false
            break
          }
          if (range.max !== undefined && numValue > range.max) {
            ok = false
            break
          }
        }
      }

      // フィルタ条件（旧方式との互換性）
      if (ok && filterRaw) {
        for (const k of Object.keys(filter)) {
          const f = filter[k]
          if (!f || f.cond.length === 0) continue

          const matches = f.cond.map((cond: any) => {
            const useMode = (k === 'name') ? mode : 'exact'
            const fieldValue = card[k] === undefined ? '' : card[k]
            const isNameField = (k === 'name')
            const isTextField = ['text', 'pendulumText', 'supplementInfo', 'pendulumSupplementInfo'].includes(k)
            const normalizedVal = (isNameField && nameModifiedIndex >= 0) ? card['nameModified'] : undefined

            return valueMatches(
              fieldValue,
              cond,
              useMode,
              flagAutoModify,
              isNameField,
              normalizedVal,
              flagAllowWild,
              isTextField,
              flagNearly,
              k
            )
          })

          const passed = f.op === 'or' ? matches.some(Boolean) : matches.every(Boolean)
          if (!passed) {
            ok = false
            break
          }
        }
      }

      if (ok) {
        results.push(card)
        if (results.length >= max) {
          break
        }
      }
    }

    return results
  }

  /**
   * 選択肢データを取得
   *
   * @param fieldName フィールド名
   * @returns 選択肢のリスト
   */
  async getOptions(fieldName: string): Promise<string[]> {
    // プリロード未完了の場合は待機
    if (!this.cards.length) {
      await this.load()
    }

    // linkMarkersは特別処理（固定の選択肢を返す）
    // テンキー配置: 7 8 9 / 4 - 6 / 1 2 3
    if (fieldName === 'linkMarkers') {
      return ['1:左下', '2:下', '3:右下', '4:左', '6:右', '7:左上', '8:上', '9:右上']
    }

    const optionsSet = new Set<string>()

    for (const card of this.cards) {
      const value = card[fieldName]
      if (!value) continue

      // JSON配列フィールドの場合
      if (fieldName === 'monsterTypes') {
        try {
          const arrayValues = JSON.parse(value)
          arrayValues.forEach((v: string) => optionsSet.add(v))
        } catch {
          // パースエラーは無視
        }
      } else {
        // 単一値フィールドの場合
        optionsSet.add(value)
      }
    }

    return Array.from(optionsSet).sort()
  }

  /**
   * キャッシュをクリア
   */
  async clearCache(): Promise<void> {
    if (this.db) {
      await this.db.clear(STORE_NAME)
      this.cards = []
      this.headers = []
      console.log('Cache cleared')
    }
  }

  /**
   * ロード済みかどうか
   */
  get isLoaded(): boolean {
    return this.cards.length > 0
  }

  /**
   * ロード中かどうか
   */
  get loading(): boolean {
    return this.isLoading
  }

  /**
   * ロード済みカード件数
   */
  get count(): number {
    return this.cards.length
  }
}

// シングルトンインスタンス
export const cardDatabase = new CardDatabase()
