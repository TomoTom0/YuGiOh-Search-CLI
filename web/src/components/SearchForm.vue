<template>
  <div class="search-form">
    <form @submit.prevent="handleSubmit">
      <div class="form-group">
        <label for="card-query">検索クエリ</label>
        <input
          id="card-query"
          v-model="searchQuery"
          type="text"
          placeholder="カード名や効果テキストを検索... (例: -&quot;融合&quot; &quot;青眼&quot; reg:.*ドラゴン)"
          class="search-input"
        />
        <small class="help-text">
          マイナス検索: -word, -"phrase" | フレーズ: "phrase" | 正規表現: reg:pattern
        </small>
      </div>

      <div class="form-group">
        <label>検索対象フィールド</label>
        <div class="preset-buttons">
          <button type="button" class="preset-button" @click="handlePresetChange('all')">すべて</button>
          <button type="button" class="preset-button" @click="handlePresetChange('name-ruby')">カード名+ルビ</button>
          <button type="button" class="preset-button" @click="handlePresetChange('text-pend')">効果テキスト+Pテキスト</button>
          <button type="button" class="preset-button" @click="handlePresetChange('supply-pend-supply')">補足情報+P補足情報</button>
        </div>
        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="searchName" />
            カード名
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="searchRuby" />
            ルビ
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="searchText" />
            効果テキスト
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="searchPendulumText" />
            Pテキスト
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="searchSupplementInfo" />
            補足情報
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="searchPendulumSupplementInfo" />
            P補足情報
          </label>
        </div>
      </div>

      <div class="form-group collapsible">
        <label @click="toggleOptionFilters" class="collapsible-label">
          <span class="toggle-icon">{{ showOptionFilters ? '▼' : '▶' }}</span>
          詳細条件（選択肢）
        </label>
        <div v-show="showOptionFilters" class="collapsible-content">
          <CardOptionFilters @change="handleOptionFiltersChange" />
        </div>
      </div>

      <div class="form-group collapsible">
        <label @click="toggleRangeFilters" class="collapsible-label">
          <span class="toggle-icon">{{ showRangeFilters ? '▼' : '▶' }}</span>
          詳細条件（数値範囲）
        </label>
        <div v-show="showRangeFilters" class="collapsible-content">
          <CardRangeFilters @change="handleRangeFiltersChange" />
        </div>
      </div>

      <button type="submit" class="search-button">
        検索
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import CardOptionFilters from './CardOptionFilters.vue'
import CardRangeFilters from './CardRangeFilters.vue'

const searchQuery = ref('')
const searchName = ref(true)
const searchRuby = ref(true)
const searchText = ref(true)
const searchPendulumText = ref(true)
const searchSupplementInfo = ref(true)
const searchPendulumSupplementInfo = ref(true)

const optionFilters = ref<any>({})
const rangeFilters = ref<any>({})

const showOptionFilters = ref(false)
const showRangeFilters = ref(false)

const emit = defineEmits<{
  search: [
    query: string,
    fields: Array<'name' | 'ruby' | 'text' | 'pendulumText' | 'supplementInfo' | 'pendulumSupplementInfo' | 'all'>,
    optionFilters: any,
    rangeFilters: any
  ]
}>()

function handlePresetChange(preset: string) {
  // すべてのフィールドをリセット
  searchName.value = false
  searchRuby.value = false
  searchText.value = false
  searchPendulumText.value = false
  searchSupplementInfo.value = false
  searchPendulumSupplementInfo.value = false

  // プリセットに応じてフィールドを選択
  if (preset === 'all') {
    searchName.value = true
    searchRuby.value = true
    searchText.value = true
    searchPendulumText.value = true
    searchSupplementInfo.value = true
    searchPendulumSupplementInfo.value = true
  } else if (preset === 'name-ruby') {
    searchName.value = true
    searchRuby.value = true
  } else if (preset === 'text-pend') {
    searchText.value = true
    searchPendulumText.value = true
  } else if (preset === 'supply-pend-supply') {
    searchSupplementInfo.value = true
    searchPendulumSupplementInfo.value = true
  }
}

function toggleOptionFilters() {
  showOptionFilters.value = !showOptionFilters.value
}

function toggleRangeFilters() {
  showRangeFilters.value = !showRangeFilters.value
}

function handleOptionFiltersChange(filters: any) {
  optionFilters.value = filters
}

function handleRangeFiltersChange(filters: any) {
  rangeFilters.value = filters
}

function handleSubmit() {
  const fields: Array<'name' | 'ruby' | 'text' | 'pendulumText' | 'supplementInfo' | 'pendulumSupplementInfo' | 'all'> = []

  if (searchName.value) fields.push('name')
  if (searchRuby.value) fields.push('ruby')
  if (searchText.value) fields.push('text')
  if (searchPendulumText.value) fields.push('pendulumText')
  if (searchSupplementInfo.value) fields.push('supplementInfo')
  if (searchPendulumSupplementInfo.value) fields.push('pendulumSupplementInfo')

  // 何も選択されていない場合はすべてを検索
  if (fields.length === 0) {
    fields.push('all')
  }

  emit('search', searchQuery.value.trim(), fields, optionFilters.value, rangeFilters.value)
}
</script>

<style scoped>
.search-form {
  background-color: #f5f5f5;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 2rem;
}

.form-group {
  margin-bottom: 1rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: bold;
  color: #333;
}

.search-input {
  width: 100%;
  padding: 0.75rem;
  font-size: 1rem;
  border: 2px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}

.search-input:focus {
  outline: none;
  border-color: #2c3e50;
}

.help-text {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.85rem;
  color: #666;
}

.preset-buttons {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.preset-button {
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  color: #2c3e50;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-button:hover {
  background-color: #f0f0f0;
  border-color: #2c3e50;
}

.preset-button:active {
  background-color: #e0e0e0;
}

.checkbox-group {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: normal;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
}

.search-button {
  width: 100%;
  padding: 0.75rem;
  font-size: 1rem;
  font-weight: bold;
  color: white;
  background-color: #2c3e50;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.search-button:hover:not(:disabled) {
  background-color: #1a252f;
}

.search-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.collapsible {
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
}

.collapsible-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: #f0f0f0;
  cursor: pointer;
  margin-bottom: 0;
  user-select: none;
  transition: background-color 0.2s;
}

.collapsible-label:hover {
  background-color: #e8e8e8;
}

.toggle-icon {
  font-size: 0.8rem;
  color: #666;
}

.collapsible-content {
  padding: 1rem;
  background-color: white;
}
</style>
