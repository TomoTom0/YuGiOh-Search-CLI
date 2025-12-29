/**
 * ブラウザ専用FAQDatabaseクラス
 * IndexedDBとfetchを使用してFAQデータを管理
 */

import { openDB, type IDBPDatabase } from 'idb'
import { parseSearchQuery, matchParsedQuery } from '../../../src/lib/shared/search-parser.js'
import type { Faq, FaqSearchParams } from './types.js'

const DB_NAME = 'YuGiOhFaqDB'
const DB_VERSION = 1
const STORE_NAME = 'faqs'
const DATA_VERSION = 2 // 改行コード処理の修正: v1 -> v2

/**
 * FAQデータベースクラス
 *
 * ブラウザ環境でFAQ検索を実行するためのデータベースクラスです。
 * 初回ロード時にバックグラウンドでTSVファイルをプリロードし、
 * IndexedDBにキャッシュして高速な検索を実現します。
 */
export class FaqDatabase {
  private db: IDBPDatabase | null = null
  private faqs: Faq[] = []
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
    const cachedData = await this.db.get(STORE_NAME, 'faqs-data')
    if (cachedData && cachedData.version === DATA_VERSION) {
      this.faqs = cachedData.faqs
      console.log(`Loaded ${this.faqs.length} FAQs from IndexedDB cache (v${DATA_VERSION})`)
      return
    }

    // バージョンが異なる、または存在しない場合
    if (cachedData) {
      console.log(`Cache version mismatch (cached: v${cachedData.version || 1}, current: v${DATA_VERSION}), reloading...`)
    }

    // fetchでTSVファイルをダウンロード
    const response = await fetch('/data/tsv/faq-all.tsv')
    if (!response.ok) {
      throw new Error(`Failed to fetch faq-all.tsv: ${response.statusText}`)
    }

    const text = await response.text()
    const lines = text.split('\n').filter(line => line.trim())

    if (lines.length === 0) {
      throw new Error('faq-all.tsv is empty')
    }

    // ヘッダー行をスキップ
    const faqs: Faq[] = []
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('\t')
      if (parts.length >= 4) {
        faqs.push({
          faqId: parts[0],
          question: parts[1],
          answer: parts[2],
          updatedAt: parts[3]
        })
      }
    }

    this.faqs = faqs
    console.log(`Loaded ${this.faqs.length} FAQs from TSV`)

    // IndexedDBにキャッシュ (バージョン番号を含める)
    await this.db.put(STORE_NAME, { version: DATA_VERSION, faqs: this.faqs }, 'faqs-data')
  }

  /**
   * FAQ検索を実行
   *
   * @param params 検索パラメータ
   * @returns マッチしたFAQの配列
   */
  async search(params: FaqSearchParams): Promise<Faq[]> {
    // プリロード未完了の場合は待機
    if (!this.faqs.length) {
      await this.load()
    }

    const {
      query = '',
      fields = ['all'],
      cardName,
      faqId,
      updatedAt,
      max = 100
    } = params

    // 検索クエリをパース
    const parsed = query ? parseSearchQuery(query) : null

    const results: Faq[] = []

    for (const faq of this.faqs) {
      // FAQ IDフィルタ
      if (faqId && faq.faqId !== faqId) {
        continue
      }

      // 更新日フィルタ
      if (updatedAt && !faq.updatedAt.startsWith(updatedAt)) {
        continue
      }

      // 登場カード名フィルタ
      if (cardName) {
        const questionContains = faq.question.includes(cardName)
        const answerContains = faq.answer.includes(cardName)
        if (!questionContains && !answerContains) {
          continue
        }
      }

      // 検索クエリフィルタ
      if (parsed) {
        let matched = false

        // 検索対象フィールドを決定
        const searchFields = fields.includes('all')
          ? ['question', 'answer']
          : fields

        // いずれかのフィールドでマッチすればOK
        for (const field of searchFields) {
          const text = faq[field as keyof Faq]
          if (typeof text === 'string' && matchParsedQuery(text, parsed)) {
            matched = true
            break
          }
        }

        if (!matched) {
          continue
        }
      }

      results.push(faq)

      if (results.length >= max) {
        break
      }
    }

    return results
  }

  /**
   * キャッシュをクリア
   */
  async clearCache(): Promise<void> {
    if (this.db) {
      await this.db.clear(STORE_NAME)
      this.faqs = []
      console.log('FAQ cache cleared')
    }
  }

  /**
   * ロード済みかどうか
   */
  get isLoaded(): boolean {
    return this.faqs.length > 0
  }

  /**
   * ロード中かどうか
   */
  get loading(): boolean {
    return this.isLoading
  }

  /**
   * ロード済みFAQ件数
   */
  get count(): number {
    return this.faqs.length
  }
}

// シングルトンインスタンス
export const faqDatabase = new FaqDatabase()
