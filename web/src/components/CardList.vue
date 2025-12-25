<template>
  <div class="card-list">
    <div v-if="loading" class="loading">
      検索中...
    </div>
    <div v-else-if="cards.length === 0" class="no-results">
      <p v-if="searched">該当するカードが見つかりませんでした。</p>
      <p v-else>カード名を入力して検索してください。</p>
    </div>
    <div v-else class="results">
      <div class="results-header">
        <p>{{ cards.length }}件のカードが見つかりました</p>
      </div>
      <div class="cards">
        <div
          v-for="card in cards"
          :key="card.cardId"
          class="card-item"
          :class="{ expanded: expandedCards.has(card.cardId) }"
          @click="toggleCard(card.cardId)"
        >
          <div class="card-header">
            <div class="card-name">{{ card.name }}</div>
            <button class="expand-button" @click.stop="toggleCard(card.cardId)">
              {{ expandedCards.has(card.cardId) ? '▲' : '▼' }}
            </button>
          </div>
          <div class="card-meta">
            <span class="card-type">{{ card.cardType }}</span>
            <span class="card-id">ID: {{ card.cardId }}</span>
          </div>
          <div class="card-preview" v-if="!expandedCards.has(card.cardId)">
            {{ getCardPreview(card) }}
          </div>
          <div class="card-details" v-if="expandedCards.has(card.cardId)">
            <div v-for="row in getCardDetailsRows(card)" :key="row.key" :class="row.className">
              <template v-if="row.type === 'single'">
                <span class="detail-label">{{ row.label }}:</span>
                <span v-if="row.key === 'linkMarkers'" class="detail-value">
                  <div class="link-markers-grid">
                    <div
                      v-for="pos in [7, 8, 9, 4, 5, 6, 1, 2, 3]"
                      :key="pos"
                      class="link-marker-cell"
                      :class="{ active: pos !== 5 && row.value && row.value.includes(String(pos)) }"
                    >
                      <div v-if="pos !== 5" class="arrow" :data-position="pos"></div>
                    </div>
                  </div>
                </span>
                <span v-else class="detail-value">{{ row.value }}</span>
              </template>
              <template v-else-if="row.type === 'double'">
                <div class="detail-pair">
                  <div class="detail-pair-item">
                    <span class="detail-label">{{ row.label1 }}:</span>
                    <span class="detail-value">{{ row.value1 }}</span>
                  </div>
                  <div class="detail-pair-item">
                    <span class="detail-label">{{ row.label2 }}:</span>
                    <span class="detail-value">{{ row.value2 }}</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Card } from '../lib/types.js'
import { translateValue, translateFieldName } from '../lib/translations.js'

defineProps<{
  cards: Card[]
  loading: boolean
  searched: boolean
}>()

const expandedCards = ref(new Set<string>())

function toggleCard(cardId: string) {
  if (expandedCards.value.has(cardId)) {
    expandedCards.value.delete(cardId)
  } else {
    expandedCards.value.add(cardId)
  }
  // Setの変更を検知させるために新しいSetを作成
  expandedCards.value = new Set(expandedCards.value)
}

function getCardPreview(card: Card): string {
  const textFields = ['text', 'pendulumText', 'supplementInfo']
  for (const field of textFields) {
    const text = card[field]
    if (text && typeof text === 'string' && text.trim()) {
      // \nを改行文字に変換してから最初の100文字を表示
      const convertedText = text.replace(/\\n/g, '\n')
      return convertedText.length > 100 ? convertedText.substring(0, 100) + '...' : convertedText
    }
  }
  return ''
}

function getCardDetails(card: Card): Record<string, string> {
  const details: Record<string, string> = {}
  const excludeKeys = [
    'cardId',
    'name',
    'cardType',
    'ciid',
    'nameModified',
    'isExtraDeck',
    'biko',
    'isNotLegalForOfficial'
  ]

  for (const [key, value] of Object.entries(card)) {
    if (!excludeKeys.includes(key) && value !== undefined && value !== null && value !== '') {
      details[key] = String(value)
    }
  }

  return details
}

interface DetailRow {
  key: string
  type: 'single' | 'double'
  className: string
  label?: string
  value?: string
  label1?: string
  value1?: string
  label2?: string
  value2?: string
}

function getCardDetailsRows(card: Card): DetailRow[] {
  const details = getCardDetails(card)
  const rows: DetailRow[] = []

  // 優先順位の高いフィールドの順序
  const fieldOrder = [
    'attribute', 'race', 'levelType', 'levelValue', 'atk', 'def',
    'linkMarkers', 'pendulumScale', 'spellEffectType', 'trapEffectType',
    'monsterTypes', 'ruby', 'imgs', 'text', 'pendulumText',
    'supplementInfo', 'pendulumSupplementInfo'
  ]

  // 一行に2つ表示するペア
  const pairs: Array<[string, string]> = [
    ['attribute', 'race'],
    ['levelType', 'levelValue'],
    ['atk', 'def'],
    ['pendulumScale', 'linkMarkers']
  ]

  const usedKeys = new Set<string>()

  // ペアで表示
  for (const [key1, key2] of pairs) {
    if (details[key1] && details[key2]) {
      rows.push({
        key: `${key1}-${key2}`,
        type: 'double',
        className: 'detail-row detail-row-pair',
        label1: translateFieldName(key1),
        value1: translateValue(key1, details[key1]),
        label2: translateFieldName(key2),
        value2: translateValue(key2, details[key2])
      })
      usedKeys.add(key1)
      usedKeys.add(key2)
    }
  }

  // 順序に従って単独表示
  for (const key of fieldOrder) {
    if (details[key] && !usedKeys.has(key)) {
      rows.push({
        key,
        type: 'single',
        className: key === 'text' || key === 'pendulumText' || key === 'supplementInfo' || key === 'pendulumSupplementInfo'
          ? 'detail-row detail-row-text'
          : 'detail-row',
        label: translateFieldName(key),
        value: translateValue(key, details[key])
      })
      usedKeys.add(key)
    }
  }

  // その他のフィールド
  for (const [key, value] of Object.entries(details)) {
    if (!usedKeys.has(key)) {
      rows.push({
        key,
        type: 'single',
        className: 'detail-row',
        label: translateFieldName(key),
        value: translateValue(key, value)
      })
    }
  }

  return rows
}
</script>

<style scoped>
.card-list {
  min-height: 200px;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
  font-size: 1.1rem;
}

.no-results {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.results-header {
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #ddd;
}

.results-header p {
  margin: 0;
  color: #666;
  font-size: 0.9rem;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card-item {
  padding: 1rem;
  background-color: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  transition: box-shadow 0.2s;
  cursor: pointer;
}

.card-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-item.expanded {
  border-color: #2c3e50;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.card-name {
  font-weight: bold;
  color: #2c3e50;
  flex: 1;
}

.expand-button {
  background: none;
  border: none;
  color: #666;
  font-size: 1rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  transition: color 0.2s;
}

.expand-button:hover {
  color: #2c3e50;
}

.card-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.9rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.card-type {
  font-style: italic;
}

.card-id {
  color: #999;
}

.card-preview {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background-color: #f8f9fa;
  border-left: 3px solid #ddd;
  font-size: 0.9rem;
  color: #555;
  line-height: 1.4;
  white-space: pre-wrap;
}

.card-details {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.detail-row {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e9ecef;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row-pair {
  padding: 0.5rem 0;
}

.detail-row-text {
  flex-direction: column;
  gap: 0.25rem;
}

.detail-pair {
  display: flex;
  gap: 2rem;
  width: 100%;
}

.detail-pair-item {
  display: flex;
  gap: 0.5rem;
  flex: 1;
}

.detail-label {
  font-weight: 600;
  color: #495057;
  min-width: 120px;
  flex-shrink: 0;
}

.detail-value {
  color: #212529;
  word-break: break-word;
  white-space: pre-wrap;
}

.link-markers-grid {
  display: grid;
  grid-template-columns: repeat(3, 30px);
  grid-template-rows: repeat(3, 30px);
  gap: 2px;
  background-color: #e9ecef;
  padding: 4px;
  border-radius: 4px;
  width: fit-content;
}

.link-marker-cell {
  width: 30px;
  height: 30px;
  background-color: #fff;
  border: 1px solid #dee2e6;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.link-marker-cell:nth-child(5) {
  background-color: #495057;
}

.link-marker-cell.active {
  background-color: #0d6efd;
  border-color: #0d6efd;
}

.arrow {
  width: 0;
  height: 0;
  border-style: solid;
}

.arrow[data-position="1"] {
  border-width: 8px 6px 0 6px;
  border-color: #fff transparent transparent transparent;
  transform: rotate(-45deg);
}

.arrow[data-position="2"] {
  border-width: 8px 6px 0 6px;
  border-color: #fff transparent transparent transparent;
}

.arrow[data-position="3"] {
  border-width: 8px 6px 0 6px;
  border-color: #fff transparent transparent transparent;
  transform: rotate(45deg);
}

.arrow[data-position="4"] {
  border-width: 6px 8px 6px 0;
  border-color: transparent #fff transparent transparent;
  transform: rotate(180deg);
}

.arrow[data-position="6"] {
  border-width: 6px 8px 6px 0;
  border-color: transparent #fff transparent transparent;
}

.arrow[data-position="7"] {
  border-width: 0 6px 8px 6px;
  border-color: transparent transparent #fff transparent;
  transform: rotate(45deg);
}

.arrow[data-position="8"] {
  border-width: 0 6px 8px 6px;
  border-color: transparent transparent #fff transparent;
}

.arrow[data-position="9"] {
  border-width: 0 6px 8px 6px;
  border-color: transparent transparent #fff transparent;
  transform: rotate(-45deg);
}
</style>
