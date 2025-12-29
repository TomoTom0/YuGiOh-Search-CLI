<template>
  <div class="faq-search-form">
    <form @submit.prevent="handleSubmit">
      <div class="form-group">
        <label for="faq-query">検索クエリ</label>
        <input
          id="faq-query"
          v-model="searchQuery"
          type="text"
          placeholder="質問文や回答を検索... (例: -&quot;融合&quot; &quot;青眼&quot; reg:.*マジシャン)"
          class="search-input"
        />
        <small class="help-text">
          マイナス検索: -word, -"phrase" | フレーズ: "phrase" | 正規表現: reg:pattern
        </small>
      </div>

      <div class="form-group">
        <label>検索対象</label>
        <div class="preset-buttons">
          <button type="button" class="preset-button" @click="handlePresetChange('all')">すべて</button>
          <button type="button" class="preset-button" @click="handlePresetChange('question')">質問文のみ</button>
          <button type="button" class="preset-button" @click="handlePresetChange('answer')">回答のみ</button>
        </div>
        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="searchQuestion" />
            質問文
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="searchAnswer" />
            回答
          </label>
        </div>
      </div>

      <div class="form-group">
        <label for="card-name">登場カード検索（カード名）</label>
        <input
          id="card-name"
          v-model="cardName"
          type="text"
          placeholder="カード名を入力..."
          class="search-input"
        />
        <small class="help-text">
          質問文・回答に指定したカード名が含まれるFAQを検索します
        </small>
      </div>

      <button type="submit" class="search-button">
        検索
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const searchQuery = ref('')
const searchQuestion = ref(true)
const searchAnswer = ref(true)
const cardName = ref('')

const emit = defineEmits<{
  search: [query: string, fields: Array<'question' | 'answer' | 'all'>, cardName: string]
}>()

function handlePresetChange(preset: string) {
  searchQuestion.value = false
  searchAnswer.value = false

  if (preset === 'all') {
    searchQuestion.value = true
    searchAnswer.value = true
  } else if (preset === 'question') {
    searchQuestion.value = true
  } else if (preset === 'answer') {
    searchAnswer.value = true
  }
}

function handleSubmit() {
  const fields: Array<'question' | 'answer' | 'all'> = []

  if (searchQuestion.value) fields.push('question')
  if (searchAnswer.value) fields.push('answer')

  // 何も選択されていない場合はすべてを検索
  if (fields.length === 0) {
    fields.push('all')
  }

  emit('search', searchQuery.value.trim(), fields, cardName.value.trim())
}
</script>

<style scoped>
.faq-search-form {
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
  gap: 1.5rem;
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
</style>
