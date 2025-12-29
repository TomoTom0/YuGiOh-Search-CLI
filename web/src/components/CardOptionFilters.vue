<template>
  <div class="option-filters">
    <div class="filter-group">
      <div class="filter-header">
        <label>カードタイプ</label>
        <div class="filter-controls">
          <button type="button" class="operator-button" @click="toggleOperator('cardType')">
            {{ cardTypeSelection.operator === 'or' ? 'OR' : 'AND' }}
          </button>
          <button type="button" class="select-button" @click="clearAll('cardType')">
            すべて解除
          </button>
        </div>
      </div>
      <div class="option-buttons">
        <button
          v-for="option in cardTypeOptions"
          :key="option"
          type="button"
          :class="getButtonClass('cardType', option)"
          @click="handleButtonClick($event, 'cardType', option)"
          @mousemove="handleMouseMove($event, 'cardType', option)"
          @mouseleave="handleMouseLeave"
        >
          {{ getOptionLabel('cardType', option) }}
        </button>
      </div>
    </div>

    <div class="filter-group">
      <div class="filter-header">
        <label>種族</label>
        <div class="filter-controls">
          <button type="button" class="operator-button" @click="toggleOperator('race')">
            {{ raceSelection.operator === 'or' ? 'OR' : 'AND' }}
          </button>
          <button type="button" class="select-button" @click="clearAll('race')">
            すべて解除
          </button>
        </div>
      </div>
      <div class="option-buttons">
        <button
          v-for="option in raceOptions"
          :key="option"
          type="button"
          :class="getButtonClass('race', option)"
          @click="handleButtonClick($event, 'race', option)"
          @mousemove="handleMouseMove($event, 'race', option)"
          @mouseleave="handleMouseLeave"
        >
          {{ getOptionLabel('race', option) }}
        </button>
      </div>
    </div>

    <div class="filter-group">
      <div class="filter-header">
        <label>属性</label>
        <div class="filter-controls">
          <button type="button" class="operator-button" @click="toggleOperator('attribute')">
            {{ attributeSelection.operator === 'or' ? 'OR' : 'AND' }}
          </button>
          <button type="button" class="select-button" @click="clearAll('attribute')">
            すべて解除
          </button>
        </div>
      </div>
      <div class="option-buttons">
        <button
          v-for="option in attributeOptions"
          :key="option"
          type="button"
          :class="getButtonClass('attribute', option)"
          @click="handleButtonClick($event, 'attribute', option)"
          @mousemove="handleMouseMove($event, 'attribute', option)"
          @mouseleave="handleMouseLeave"
        >
          {{ getOptionLabel('attribute', option) }}
        </button>
      </div>
    </div>

    <div class="filter-group">
      <div class="filter-header">
        <label>魔法タイプ</label>
        <div class="filter-controls">
          <button type="button" class="operator-button" @click="toggleOperator('spellEffectType')">
            {{ spellEffectTypeSelection.operator === 'or' ? 'OR' : 'AND' }}
          </button>
          <button type="button" class="select-button" @click="clearAll('spellEffectType')">
            すべて解除
          </button>
        </div>
      </div>
      <div class="option-buttons">
        <button
          v-for="option in spellEffectTypeOptions"
          :key="option"
          type="button"
          :class="getButtonClass('spellEffectType', option)"
          @click="handleButtonClick($event, 'spellEffectType', option)"
          @mousemove="handleMouseMove($event, 'spellEffectType', option)"
          @mouseleave="handleMouseLeave"
        >
          {{ getOptionLabel('spellEffectType', option) }}
        </button>
      </div>
    </div>

    <div class="filter-group">
      <div class="filter-header">
        <label>罠タイプ</label>
        <div class="filter-controls">
          <button type="button" class="operator-button" @click="toggleOperator('trapEffectType')">
            {{ trapEffectTypeSelection.operator === 'or' ? 'OR' : 'AND' }}
          </button>
          <button type="button" class="select-button" @click="clearAll('trapEffectType')">
            すべて解除
          </button>
        </div>
      </div>
      <div class="option-buttons">
        <button
          v-for="option in trapEffectTypeOptions"
          :key="option"
          type="button"
          :class="getButtonClass('trapEffectType', option)"
          @click="handleButtonClick($event, 'trapEffectType', option)"
          @mousemove="handleMouseMove($event, 'trapEffectType', option)"
          @mouseleave="handleMouseLeave"
        >
          {{ getOptionLabel('trapEffectType', option) }}
        </button>
      </div>
    </div>

    <div class="filter-group">
      <div class="filter-header">
        <label>モンスタータイプ</label>
        <div class="filter-controls">
          <button type="button" class="operator-button" @click="toggleOperator('monsterTypes')">
            {{ monsterTypesSelection.operator === 'or' ? 'OR' : 'AND' }}
          </button>
          <button type="button" class="select-button" @click="clearAll('monsterTypes')">
            すべて解除
          </button>
        </div>
      </div>
      <div class="option-buttons">
        <button
          v-for="option in monsterTypesOptions"
          :key="option"
          type="button"
          :class="getButtonClass('monsterTypes', option)"
          @click="handleButtonClick($event, 'monsterTypes', option)"
          @mousemove="handleMouseMove($event, 'monsterTypes', option)"
          @mouseleave="handleMouseLeave"
        >
          {{ option }}
        </button>
      </div>
    </div>

    <div class="filter-group">
      <div class="filter-header">
        <label>リンクマーカー</label>
        <div class="filter-controls">
          <button type="button" class="operator-button" @click="toggleOperator('linkMarkers')">
            {{ linkMarkersSelection.operator === 'or' ? 'OR' : 'AND' }}
          </button>
          <button type="button" class="select-button" @click="clearAll('linkMarkers')">
            すべて解除
          </button>
        </div>
      </div>
      <div class="link-markers-selector">
        <div
          v-for="pos in [7, 8, 9, 4, 5, 6, 1, 2, 3]"
          :key="pos"
          :class="getLinkMarkerCellClass(pos)"
          @click="pos !== 5 && handleLinkMarkerClick($event, pos)"
          @mousemove="pos !== 5 && handleLinkMarkerMouseMove($event, pos)"
          @mouseleave="handleLinkMarkerMouseLeave"
        >
          <div v-if="pos !== 5" class="arrow" :data-position="pos"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { cardDatabase } from '../lib/CardDatabase.js'
import type { OptionFilterSelection } from '../lib/types.js'
import {
  cardTypeTranslations,
  raceTranslations,
  attributeTranslations,
  spellEffectTypeTranslations,
  trapEffectTypeTranslations
} from '../lib/translations.js'

const cardTypeOptions = ref<string[]>([])
const raceOptions = ref<string[]>([])
const attributeOptions = ref<string[]>([])
const spellEffectTypeOptions = ref<string[]>([])
const trapEffectTypeOptions = ref<string[]>([])
const monsterTypesOptions = ref<string[]>([])
const linkMarkersOptions = ref<string[]>([])

const cardTypeSelection = ref<OptionFilterSelection>({ positive: [], negative: [], operator: 'or' })
const raceSelection = ref<OptionFilterSelection>({ positive: [], negative: [], operator: 'or' })
const attributeSelection = ref<OptionFilterSelection>({ positive: [], negative: [], operator: 'or' })
const spellEffectTypeSelection = ref<OptionFilterSelection>({ positive: [], negative: [], operator: 'or' })
const trapEffectTypeSelection = ref<OptionFilterSelection>({ positive: [], negative: [], operator: 'or' })
const monsterTypesSelection = ref<OptionFilterSelection>({ positive: [], negative: [], operator: 'or' })
const linkMarkersSelection = ref<OptionFilterSelection>({ positive: [], negative: [], operator: 'or' })

const selections: Record<string, any> = {
  cardType: cardTypeSelection,
  race: raceSelection,
  attribute: attributeSelection,
  spellEffectType: spellEffectTypeSelection,
  trapEffectType: trapEffectTypeSelection,
  monsterTypes: monsterTypesSelection,
  linkMarkers: linkMarkersSelection
}

// ホバー時の左右判定用
const hoverSide = ref<'left' | 'right' | null>(null)
const hoverTarget = ref<{ group: string; option: string } | null>(null)

// リンクマーカー用のホバー状態
const linkMarkerHoverSide = ref<'left' | 'right' | null>(null)
const linkMarkerHoverPos = ref<number | null>(null)

const emit = defineEmits<{
  change: [filters: {
    cardType?: OptionFilterSelection
    race?: OptionFilterSelection
    attribute?: OptionFilterSelection
    spellEffectType?: OptionFilterSelection
    trapEffectType?: OptionFilterSelection
    monsterTypes?: OptionFilterSelection
    linkMarkers?: OptionFilterSelection
  }]
}>()

// 選択肢データをロード
onMounted(async () => {
  cardTypeOptions.value = await cardDatabase.getOptions('cardType')
  raceOptions.value = await cardDatabase.getOptions('race')
  attributeOptions.value = await cardDatabase.getOptions('attribute')
  spellEffectTypeOptions.value = await cardDatabase.getOptions('spellEffectType')
  trapEffectTypeOptions.value = await cardDatabase.getOptions('trapEffectType')
  monsterTypesOptions.value = await cardDatabase.getOptions('monsterTypes')
  linkMarkersOptions.value = await cardDatabase.getOptions('linkMarkers')
})

function getButtonClass(group: string, option: string): string {
  const selection = selections[group].value
  const classes = ['option-button']

  if (selection.positive.includes(option)) {
    classes.push('positive')
  } else if (selection.negative.includes(option)) {
    classes.push('negative')
  }

  // ホバー時の左右表示
  if (hoverTarget.value?.group === group && hoverTarget.value?.option === option) {
    if (hoverSide.value === 'left') {
      classes.push('hover-left')
    } else if (hoverSide.value === 'right') {
      classes.push('hover-right')
    }
  }

  return classes.join(' ')
}

function handleMouseMove(event: MouseEvent, group: string, option: string) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const halfWidth = rect.width / 2

  hoverTarget.value = { group, option }
  hoverSide.value = mouseX < halfWidth ? 'left' : 'right'
}

function handleMouseLeave() {
  hoverTarget.value = null
  hoverSide.value = null
}

function handleButtonClick(event: MouseEvent, group: string, option: string) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clickX = event.clientX - rect.left
  const halfWidth = rect.width / 2

  // 左半分クリック: 肯定選択
  if (clickX < halfWidth) {
    togglePositive(group, option)
  } else {
    // 右半分クリック: 否定選択
    toggleNegative(group, option)
  }
}

function togglePositive(group: string, option: string) {
  const selection = selections[group].value
  const posIndex = selection.positive.indexOf(option)
  const negIndex = selection.negative.indexOf(option)

  // 否定選択を解除
  if (negIndex !== -1) {
    selection.negative.splice(negIndex, 1)
  }

  // 肯定選択をトグル
  if (posIndex === -1) {
    selection.positive.push(option)
  } else {
    selection.positive.splice(posIndex, 1)
  }
}

function toggleNegative(group: string, option: string) {
  const selection = selections[group].value
  const posIndex = selection.positive.indexOf(option)
  const negIndex = selection.negative.indexOf(option)

  // 肯定選択を解除
  if (posIndex !== -1) {
    selection.positive.splice(posIndex, 1)
  }

  // 否定選択をトグル
  if (negIndex === -1) {
    selection.negative.push(option)
  } else {
    selection.negative.splice(negIndex, 1)
  }
}

function toggleOperator(group: string) {
  const selection = selections[group].value
  selection.operator = selection.operator === 'or' ? 'and' : 'or'
}

function clearAll(group: string) {
  const selection = selections[group].value
  selection.positive = []
  selection.negative = []
}

// リンクマーカーのセル用のクラスを取得
function getLinkMarkerCellClass(pos: number): string {
  if (pos === 5) {
    return 'link-marker-cell center'
  }

  const classes = ['link-marker-cell']
  const option = `${pos}:${getPositionLabel(pos)}`

  if (linkMarkersSelection.value.positive.includes(option)) {
    classes.push('positive')
  } else if (linkMarkersSelection.value.negative.includes(option)) {
    classes.push('negative')
  }

  // ホバー時の左右表示
  if (linkMarkerHoverPos.value === pos) {
    if (linkMarkerHoverSide.value === 'left') {
      classes.push('hover-left')
    } else if (linkMarkerHoverSide.value === 'right') {
      classes.push('hover-right')
    }
  }

  return classes.join(' ')
}

// 位置番号からラベルを取得
function getPositionLabel(pos: number): string {
  const labels: Record<number, string> = {
    1: '左下',
    2: '下',
    3: '右下',
    4: '左',
    6: '右',
    7: '左上',
    8: '上',
    9: '右上'
  }
  return labels[pos] || ''
}

// リンクマーカーのマウス移動処理
function handleLinkMarkerMouseMove(event: MouseEvent, pos: number) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const halfWidth = rect.width / 2

  linkMarkerHoverPos.value = pos
  linkMarkerHoverSide.value = mouseX < halfWidth ? 'left' : 'right'
}

// リンクマーカーのマウスリーブ処理
function handleLinkMarkerMouseLeave() {
  linkMarkerHoverPos.value = null
  linkMarkerHoverSide.value = null
}

// リンクマーカーのクリック処理
function handleLinkMarkerClick(event: MouseEvent, pos: number) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clickX = event.clientX - rect.left
  const halfWidth = rect.width / 2
  const option = `${pos}:${getPositionLabel(pos)}`

  // 左半分クリック: 肯定選択
  if (clickX < halfWidth) {
    togglePositive('linkMarkers', option)
  } else {
    // 右半分クリック: 否定選択
    toggleNegative('linkMarkers', option)
  }
}

// オプションのラベルを取得（日本語翻訳）
function getOptionLabel(group: string, option: string): string {
  switch (group) {
    case 'cardType':
      return cardTypeTranslations[option] || option
    case 'race':
      return raceTranslations[option] || option
    case 'attribute':
      return attributeTranslations[option] || option
    case 'spellEffectType':
      return spellEffectTypeTranslations[option] || option
    case 'trapEffectType':
      return trapEffectTypeTranslations[option] || option
    default:
      return option
  }
}

// 選択が変更されたら親に通知
watch(
  [
    cardTypeSelection,
    raceSelection,
    attributeSelection,
    spellEffectTypeSelection,
    trapEffectTypeSelection,
    monsterTypesSelection,
    linkMarkersSelection
  ],
  () => {
    const filters: any = {}

    if (cardTypeSelection.value.positive.length > 0 || cardTypeSelection.value.negative.length > 0) {
      filters.cardType = cardTypeSelection.value
    }
    if (raceSelection.value.positive.length > 0 || raceSelection.value.negative.length > 0) {
      filters.race = raceSelection.value
    }
    if (attributeSelection.value.positive.length > 0 || attributeSelection.value.negative.length > 0) {
      filters.attribute = attributeSelection.value
    }
    if (spellEffectTypeSelection.value.positive.length > 0 || spellEffectTypeSelection.value.negative.length > 0) {
      filters.spellEffectType = spellEffectTypeSelection.value
    }
    if (trapEffectTypeSelection.value.positive.length > 0 || trapEffectTypeSelection.value.negative.length > 0) {
      filters.trapEffectType = trapEffectTypeSelection.value
    }
    if (monsterTypesSelection.value.positive.length > 0 || monsterTypesSelection.value.negative.length > 0) {
      filters.monsterTypes = monsterTypesSelection.value
    }
    if (linkMarkersSelection.value.positive.length > 0 || linkMarkersSelection.value.negative.length > 0) {
      filters.linkMarkers = linkMarkersSelection.value
    }

    emit('change', filters)
  },
  { deep: true }
)
</script>

<style scoped>
.option-filters {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.filter-group {
  padding: 1rem;
  background-color: #fafafa;
  border-radius: 4px;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.filter-header label {
  margin-bottom: 0;
  font-weight: bold;
  color: #333;
}

.filter-controls {
  display: flex;
  gap: 0.5rem;
}

.operator-button {
  padding: 0.25rem 0.75rem;
  font-size: 0.85rem;
  font-weight: bold;
  color: white;
  background-color: #5a9fd4;
  border: 1px solid #4a8fc4;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 50px;
}

.operator-button:hover {
  background-color: #4a8fc4;
}

.operator-button:active {
  background-color: #3a7fb4;
}

.select-button {
  padding: 0.25rem 0.75rem;
  font-size: 0.85rem;
  color: #2c3e50;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.select-button:hover {
  background-color: #f0f0f0;
  border-color: #2c3e50;
}

.select-button:active {
  background-color: #e0e0e0;
}

.option-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.option-button {
  padding: 0.4rem 0.8rem;
  font-size: 0.9rem;
  color: #333;
  background-color: white;
  border: 2px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  position: relative;
  z-index: 0;
}

.option-button:hover {
  border-color: #999;
}

.option-button.hover-left::before {
  content: '○';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 50%;
  background-color: rgba(76, 175, 80, 0.2);
  border-radius: 2px 0 0 2px;
  pointer-events: none;
  z-index: -1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: rgba(76, 175, 80, 0.5);
}

.option-button.hover-right::before {
  content: '×';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 50%;
  background-color: rgba(244, 67, 54, 0.2);
  border-radius: 0 2px 2px 0;
  pointer-events: none;
  z-index: -1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: rgba(244, 67, 54, 0.5);
}

/* 選択済みボタンでは白で示す */
.option-button.positive.hover-left::before,
.option-button.negative.hover-left::before {
  background-color: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.8);
}

.option-button.positive.hover-right::before,
.option-button.negative.hover-right::before {
  background-color: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.8);
}

.option-button.positive {
  color: white;
  background-color: #4caf50;
  border-color: #4caf50;
}

.option-button.positive:hover {
  background-color: #45a049;
  border-color: #45a049;
}

.option-button.negative {
  color: white;
  background-color: #f44336;
  border-color: #f44336;
}

.option-button.negative:hover {
  background-color: #da190b;
  border-color: #da190b;
}

/* リンクマーカー選択用スタイル */
.link-markers-selector {
  display: grid;
  grid-template-columns: repeat(3, 40px);
  grid-template-rows: repeat(3, 40px);
  gap: 4px;
  background-color: #e9ecef;
  padding: 8px;
  border-radius: 4px;
  width: fit-content;
}

.link-marker-cell {
  width: 40px;
  height: 40px;
  background-color: white;
  border: 2px solid #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  user-select: none;
  z-index: 0;
}

.link-marker-cell:hover:not(.center) {
  border-color: #999;
}

.link-marker-cell.center {
  background-color: #495057;
  border-color: #495057;
  cursor: default;
}

.link-marker-cell.positive {
  background-color: #4caf50;
  border-color: #4caf50;
}

.link-marker-cell.negative {
  background-color: #f44336;
  border-color: #f44336;
}

.link-marker-cell.hover-left::before {
  content: '○';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 50%;
  background-color: rgba(76, 175, 80, 0.3);
  border-radius: 2px 0 0 2px;
  pointer-events: none;
  z-index: -1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: rgba(76, 175, 80, 0.8);
}

.link-marker-cell.hover-right::before {
  content: '×';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 50%;
  background-color: rgba(244, 67, 54, 0.3);
  border-radius: 0 2px 2px 0;
  pointer-events: none;
  z-index: -1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: rgba(244, 67, 54, 0.8);
}

/* 選択済みセルでは白で示す */
.link-marker-cell.positive.hover-left::before,
.link-marker-cell.negative.hover-left::before {
  background-color: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.9);
}

.link-marker-cell.positive.hover-right::before,
.link-marker-cell.negative.hover-right::before {
  background-color: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.9);
}

/* リンクマーカー用の矢印スタイル */
.link-marker-cell .arrow {
  width: 0;
  height: 0;
  border-style: solid;
}

.link-marker-cell:not(.positive):not(.negative) .arrow {
  border-color: #666;
}

.link-marker-cell.positive .arrow {
  border-color: white;
}

.link-marker-cell.negative .arrow {
  border-color: white;
}

.link-marker-cell .arrow[data-position="1"] {
  border-width: 10px 8px 0 8px;
  border-color: inherit transparent transparent transparent;
  transform: rotate(-45deg);
}

.link-marker-cell .arrow[data-position="2"] {
  border-width: 10px 8px 0 8px;
  border-color: inherit transparent transparent transparent;
}

.link-marker-cell .arrow[data-position="3"] {
  border-width: 10px 8px 0 8px;
  border-color: inherit transparent transparent transparent;
  transform: rotate(45deg);
}

.link-marker-cell .arrow[data-position="4"] {
  border-width: 8px 10px 8px 0;
  border-color: transparent inherit transparent transparent;
  transform: rotate(180deg);
}

.link-marker-cell .arrow[data-position="6"] {
  border-width: 8px 10px 8px 0;
  border-color: transparent inherit transparent transparent;
}

.link-marker-cell .arrow[data-position="7"] {
  border-width: 0 8px 10px 8px;
  border-color: transparent transparent inherit transparent;
  transform: rotate(45deg);
}

.link-marker-cell .arrow[data-position="8"] {
  border-width: 0 8px 10px 8px;
  border-color: transparent transparent inherit transparent;
}

.link-marker-cell .arrow[data-position="9"] {
  border-width: 0 8px 10px 8px;
  border-color: transparent transparent inherit transparent;
  transform: rotate(-45deg);
}
</style>
