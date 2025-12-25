<template>
  <div class="app">
    <header class="header">
      <h1>遊戯王カード検索</h1>
      <nav class="tabs">
        <button
          class="tab-button"
          :class="{ active: activeTab === 'cards' }"
          @click="activeTab = 'cards'"
        >
          カード検索
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'faq' }"
          @click="activeTab = 'faq'"
        >
          FAQ検索
        </button>
      </nav>
    </header>
    <main class="main">
      <div v-if="activeTab === 'cards'" class="tab-content">
        <SearchForm @search="handleCardSearch" />
        <CardList :cards="cardResults" :loading="isCardSearching" :searched="hasCardSearched" />
      </div>
      <div v-if="activeTab === 'faq'" class="tab-content">
        <FaqSearchForm @search="handleFaqSearch" />
        <FaqList :faqs="faqResults" :loading="isFaqSearching" :searched="hasFaqSearched" />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SearchForm from './components/SearchForm.vue'
import CardList from './components/CardList.vue'
import FaqSearchForm from './components/FaqSearchForm.vue'
import FaqList from './components/FaqList.vue'
import { cardDatabase } from './lib/CardDatabase.js'
import { faqDatabase } from './lib/FaqDatabase.js'
import type { Card, Faq } from './lib/types.js'

// タブ管理
const activeTab = ref<'cards' | 'faq'>('cards')

// カード検索
const cardResults = ref<Card[]>([])
const isCardSearching = ref(false)
const hasCardSearched = ref(false)

async function handleCardSearch(
  query: string,
  fields: Array<'name' | 'ruby' | 'text' | 'pendulumText' | 'supplementInfo' | 'pendulumSupplementInfo' | 'all'>,
  optionFilters: any,
  rangeFilters: any
) {
  isCardSearching.value = true
  hasCardSearched.value = true

  try {
    const results = await cardDatabase.search({
      query,
      fields,
      optionFilters,
      rangeFilters,
      max: 100
    })
    cardResults.value = results
  } catch (error) {
    console.error('カード検索エラー:', error)
    cardResults.value = []
  } finally {
    isCardSearching.value = false
  }
}

// FAQ検索
const faqResults = ref<Faq[]>([])
const isFaqSearching = ref(false)
const hasFaqSearched = ref(false)

async function handleFaqSearch(query: string, fields: Array<'question' | 'answer' | 'all'>, cardName: string) {
  isFaqSearching.value = true
  hasFaqSearched.value = true

  try {
    const results = await faqDatabase.search({
      query,
      fields,
      cardName,
      max: 100
    })
    faqResults.value = results
  } catch (error) {
    console.error('FAQ検索エラー:', error)
    faqResults.value = []
  } finally {
    isFaqSearching.value = false
  }
}
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #fafafa;
}

.header {
  background-color: #2c3e50;
  color: white;
  padding: 1rem 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header h1 {
  margin: 0 0 1rem 0;
  font-size: 1.5rem;
}

.tabs {
  display: flex;
  gap: 0.5rem;
}

.tab-button {
  padding: 0.5rem 1.5rem;
  font-size: 0.95rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  background-color: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-button:hover {
  color: rgba(255, 255, 255, 0.9);
}

.tab-button.active {
  color: white;
  border-bottom-color: white;
}

.main {
  flex: 1;
  padding: 2rem;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.tab-content {
  animation: fadeIn 0.3s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
