<template>
  <div class="faq-list">
    <div v-if="loading" class="loading">
      検索中...
    </div>
    <div v-else-if="faqs.length === 0" class="no-results">
      <p v-if="searched">該当するFAQが見つかりませんでした。</p>
      <p v-else>検索クエリを入力してFAQを検索してください。</p>
    </div>
    <div v-else class="results">
      <div class="results-header">
        <p>{{ faqs.length }}件のFAQが見つかりました</p>
      </div>
      <div class="faqs">
        <div v-for="faq in faqs" :key="faq.faqId" class="faq-item">
          <div class="faq-header" @click="toggleFaq(faq.faqId)">
            <div class="faq-question">
              <span class="faq-icon">{{ expandedFaqs.has(faq.faqId) ? '▼' : '▶' }}</span>
              {{ convertNewlines(faq.question) }}
            </div>
            <div class="faq-meta">
              <span class="faq-id">ID: {{ faq.faqId }}</span>
              <span class="faq-date">{{ faq.updatedAt }}</span>
            </div>
          </div>
          <div v-if="expandedFaqs.has(faq.faqId)" class="faq-answer">
            <p>{{ convertNewlines(faq.answer) }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Faq } from '../lib/types.js'

defineProps<{
  faqs: Faq[]
  loading: boolean
  searched: boolean
}>()

const expandedFaqs = ref<Set<string>>(new Set())

function toggleFaq(faqId: string) {
  if (expandedFaqs.value.has(faqId)) {
    expandedFaqs.value.delete(faqId)
  } else {
    expandedFaqs.value.add(faqId)
  }
}

function convertNewlines(text: string): string {
  return text.replace(/\\n/g, '\n')
}
</script>

<style scoped>
.faq-list {
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

.faqs {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.faq-item {
  background-color: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
}

.faq-header {
  padding: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.faq-header:hover {
  background-color: #f8f8f8;
}

.faq-question {
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: #2c3e50;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.faq-icon {
  flex-shrink: 0;
  font-size: 0.8rem;
  margin-top: 0.2rem;
}

.faq-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: #666;
}

.faq-id {
  color: #999;
}

.faq-date {
  color: #666;
}

.faq-answer {
  padding: 1rem;
  border-top: 1px solid #eee;
  background-color: #fafafa;
  white-space: pre-wrap;
  line-height: 1.6;
}

.faq-answer p {
  margin: 0;
  color: #333;
}
</style>
