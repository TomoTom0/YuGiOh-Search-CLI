<template>
  <div class="range-filters">
    <div class="filter-row">
      <label>攻撃力</label>
      <div class="range-inputs">
        <label class="checkbox-label">
          <input type="checkbox" v-model="atkExact" />
          完全一致
        </label>
        <input
          v-if="!atkExact"
          type="number"
          v-model.number="atkMin"
          placeholder="最小"
          class="range-input"
        />
        <span v-if="!atkExact">～</span>
        <input
          type="number"
          v-model.number="atkMax"
          :placeholder="atkExact ? '値' : '最大'"
          class="range-input"
        />
        <label class="checkbox-label">
          <input type="checkbox" v-model="atkQuestionMark" />
          ?
        </label>
      </div>
    </div>

    <div class="filter-row">
      <label>守備力</label>
      <div class="range-inputs">
        <label class="checkbox-label">
          <input type="checkbox" v-model="defExact" />
          完全一致
        </label>
        <input
          v-if="!defExact"
          type="number"
          v-model.number="defMin"
          placeholder="最小"
          class="range-input"
        />
        <span v-if="!defExact">～</span>
        <input
          type="number"
          v-model.number="defMax"
          :placeholder="defExact ? '値' : '最大'"
          class="range-input"
        />
        <label class="checkbox-label">
          <input type="checkbox" v-model="defQuestionMark" />
          ?
        </label>
      </div>
    </div>

    <div class="filter-row">
      <label>レベル/ランク/リンク</label>
      <div class="range-inputs">
        <label class="checkbox-label">
          <input type="checkbox" v-model="levelExact" />
          完全一致
        </label>
        <input
          v-if="!levelExact"
          type="number"
          v-model.number="levelMin"
          placeholder="最小"
          class="range-input"
        />
        <span v-if="!levelExact">～</span>
        <input
          type="number"
          v-model.number="levelMax"
          :placeholder="levelExact ? '値' : '最大'"
          class="range-input"
        />
      </div>
    </div>

    <div class="filter-row">
      <label>Pスケール</label>
      <div class="range-inputs">
        <label class="checkbox-label">
          <input type="checkbox" v-model="pendulumScaleExact" />
          完全一致
        </label>
        <input
          v-if="!pendulumScaleExact"
          type="number"
          v-model.number="pendulumScaleMin"
          placeholder="最小"
          class="range-input"
        />
        <span v-if="!pendulumScaleExact">～</span>
        <input
          type="number"
          v-model.number="pendulumScaleMax"
          :placeholder="pendulumScaleExact ? '値' : '最大'"
          class="range-input"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const atkMin = ref<number | undefined>()
const atkMax = ref<number | undefined>()
const atkExact = ref(false)
const atkQuestionMark = ref(false)

const defMin = ref<number | undefined>()
const defMax = ref<number | undefined>()
const defExact = ref(false)
const defQuestionMark = ref(false)

const levelMin = ref<number | undefined>()
const levelMax = ref<number | undefined>()
const levelExact = ref(false)

const pendulumScaleMin = ref<number | undefined>()
const pendulumScaleMax = ref<number | undefined>()
const pendulumScaleExact = ref(false)

const emit = defineEmits<{
  change: [filters: {
    atk?: { min?: number; max?: number; exact?: number; questionMark?: boolean }
    def?: { min?: number; max?: number; exact?: number; questionMark?: boolean }
    levelValue?: { min?: number; max?: number; exact?: number }
    pendulumScale?: { min?: number; max?: number; exact?: number }
  }]
}>()

// 値が変更されたら親に通知
watch(
  [
    atkMin, atkMax, atkExact, atkQuestionMark,
    defMin, defMax, defExact, defQuestionMark,
    levelMin, levelMax, levelExact,
    pendulumScaleMin, pendulumScaleMax, pendulumScaleExact
  ],
  () => {
    const filters: any = {}

    // 攻撃力
    if (atkQuestionMark.value || atkExact.value || atkMin.value !== undefined || atkMax.value !== undefined) {
      filters.atk = {}
      if (atkQuestionMark.value) {
        filters.atk.questionMark = true
      } else if (atkExact.value && atkMax.value !== undefined) {
        filters.atk.exact = atkMax.value
      } else {
        if (atkMin.value !== undefined) filters.atk.min = atkMin.value
        if (atkMax.value !== undefined) filters.atk.max = atkMax.value
      }
    }

    // 守備力
    if (defQuestionMark.value || defExact.value || defMin.value !== undefined || defMax.value !== undefined) {
      filters.def = {}
      if (defQuestionMark.value) {
        filters.def.questionMark = true
      } else if (defExact.value && defMax.value !== undefined) {
        filters.def.exact = defMax.value
      } else {
        if (defMin.value !== undefined) filters.def.min = defMin.value
        if (defMax.value !== undefined) filters.def.max = defMax.value
      }
    }

    // レベル/ランク/リンク
    if (levelExact.value || levelMin.value !== undefined || levelMax.value !== undefined) {
      filters.levelValue = {}
      if (levelExact.value && levelMax.value !== undefined) {
        filters.levelValue.exact = levelMax.value
      } else {
        if (levelMin.value !== undefined) filters.levelValue.min = levelMin.value
        if (levelMax.value !== undefined) filters.levelValue.max = levelMax.value
      }
    }

    // Pスケール
    if (pendulumScaleExact.value || pendulumScaleMin.value !== undefined || pendulumScaleMax.value !== undefined) {
      filters.pendulumScale = {}
      if (pendulumScaleExact.value && pendulumScaleMax.value !== undefined) {
        filters.pendulumScale.exact = pendulumScaleMax.value
      } else {
        if (pendulumScaleMin.value !== undefined) filters.pendulumScale.min = pendulumScaleMin.value
        if (pendulumScaleMax.value !== undefined) filters.pendulumScale.max = pendulumScaleMax.value
      }
    }

    emit('change', filters)
  }
)
</script>

<style scoped>
.range-filters {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.filter-row label {
  min-width: 100px;
  font-weight: normal;
  margin-bottom: 0;
}

.range-inputs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.range-input {
  width: 100px;
  padding: 0.5rem;
  font-size: 0.9rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}

.range-input:focus {
  outline: none;
  border-color: #2c3e50;
}

.range-inputs span {
  color: #666;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: normal;
  cursor: pointer;
  white-space: nowrap;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
}
</style>
