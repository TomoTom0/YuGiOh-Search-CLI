import { describe, it, expect } from 'vitest'

// Test wildcard and negative search parsing
function parseNegativePatterns(patternStr: string): { positive: string; negative: string[] } {
  const negativePatterns: string[] = []
  let positivePattern = patternStr
  
  const negativeRegex = /(^|[\s\u3000])-["'`]([^"'`]+)["'`]/g
  let match: RegExpExecArray | null
  
  while ((match = negativeRegex.exec(patternStr)) !== null) {
    negativePatterns.push(match[2])
  }
  
  if (negativePatterns.length > 0) {
    positivePattern = patternStr.replace(/(^|[\s\u3000])-["'`]([^"'`]+)["'`]/g, '').trim()
  }
  
  return { positive: positivePattern, negative: negativePatterns }
}

function testTextSearch(text: string, pattern: string, allowWild: boolean = true): boolean {
  const { positive, negative } = parseNegativePatterns(pattern)
  
  // Check negative patterns first
  for (const negPattern of negative) {
    if (text.includes(negPattern)) {
      return false
    }
  }
  
  // If only negative patterns
  if (!positive || positive === '') {
    return negative.length > 0
  }
  
  // Check wildcard
  if (allowWild && positive.includes('*')) {
    const regexPattern = positive
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
    const regex = new RegExp(regexPattern)
    return regex.test(text)
  }
  
  return text.includes(positive)
}

describe('Text Field Wildcard Search (Unit)', () => {
  it('should match wildcard at start', () => {
    const text = 'このカードは破壊される。'
    expect(testTextSearch(text, '*破壊*')).toBe(true)
    expect(testTextSearch(text, '*召喚*')).toBe(false)
  })

  it('should match wildcard at end', () => {
    const text = '手札から特殊召喚できる'
    expect(testTextSearch(text, '手札から*')).toBe(true)
    expect(testTextSearch(text, '墓地から*')).toBe(false)
  })

  it('should match wildcard in middle', () => {
    const text = 'ドラゴン族モンスターを対象とする'
    expect(testTextSearch(text, 'ドラゴン*モンスター*')).toBe(true)
    expect(testTextSearch(text, '魔法使い*モンスター*')).toBe(false)
  })

  it('should match exact substring without wildcard', () => {
    const text = 'このカードの効果は無効化される'
    expect(testTextSearch(text, '無効化')).toBe(true)
    expect(testTextSearch(text, '破壊')).toBe(false)
  })
})

describe('Negative Search (Unit)', () => {
  it('should exclude text with double-quoted phrase', () => {
    const text = 'このカードを破壊する'
    expect(testTextSearch(text, '破壊 -"無効"')).toBe(true)
    expect(testTextSearch(text, 'カード -"破壊"')).toBe(false)
  })

  it('should exclude text with single-quoted phrase', () => {
    const text = '墓地から特殊召喚する'
    expect(testTextSearch(text, "特殊召喚 -'手札'")).toBe(true)
    expect(testTextSearch(text, "特殊召喚 -'墓地'")).toBe(false)
  })

  it('should exclude text with backtick-quoted phrase', () => {
    const text = 'モンスターの攻撃力を上げる'
    expect(testTextSearch(text, '攻撃力 -`守備力`')).toBe(true)
    expect(testTextSearch(text, '攻撃力 -`攻撃力`')).toBe(false)
  })

  it('should handle multiple negative patterns', () => {
    const text = 'このカードを墓地へ送る'
    expect(testTextSearch(text, 'カード -"破壊" -"除外"')).toBe(true)
    expect(testTextSearch(text, 'カード -"墓地" -"除外"')).toBe(false)
  })

  it('should handle negative at start of pattern', () => {
    const text = 'ドラゴン族モンスター'
    expect(testTextSearch(text, '-"魔法使い" ドラゴン')).toBe(true)
    expect(testTextSearch(text, '-"ドラゴン" モンスター')).toBe(false)
  })

  it('should work with fullwidth space', () => {
    const text = 'このカードを除外する'
    expect(testTextSearch(text, 'カード　-"破壊"')).toBe(true)
    expect(testTextSearch(text, 'カード　-"除外"')).toBe(false)
  })

  it('should work with only negative patterns', () => {
    const text = 'ドラゴン族モンスター'
    expect(testTextSearch(text, '-"魔法使い"')).toBe(true)
    expect(testTextSearch(text, '-"ドラゴン"')).toBe(false)
  })
})

describe('Combined Wildcard and Negative Search (Unit)', () => {
  it('should support wildcard with negative', () => {
    const text = 'ドラゴン族モンスターを特殊召喚する'
    expect(testTextSearch(text, '*召喚* -"無効"')).toBe(true)
    expect(testTextSearch(text, '*召喚* -"特殊召喚"')).toBe(false)
  })

  it('should support multiple wildcards with negative', () => {
    const text = 'このカードの攻撃力は元々の攻撃力の倍になる'
    expect(testTextSearch(text, '*攻撃力*倍* -"守備力"')).toBe(true)
    expect(testTextSearch(text, '*攻撃力*倍* -"攻撃力"')).toBe(false)
  })

  it('should support negative with complex wildcard', () => {
    const text = 'フィールドの全てのモンスターを破壊する'
    expect(testTextSearch(text, '*モンスター*破壊* -"無効" -"対象"')).toBe(true)
    expect(testTextSearch(text, '*モンスター*破壊* -"フィールド"')).toBe(false)
  })
})

describe('Parse Negative Patterns (Unit)', () => {
  it('should parse double-quoted negative', () => {
    const result = parseNegativePatterns('攻撃 -"無効"')
    expect(result.positive).toBe('攻撃')
    expect(result.negative).toEqual(['無効'])
  })

  it('should parse single-quoted negative', () => {
    const result = parseNegativePatterns("召喚 -'破壊'")
    expect(result.positive).toBe('召喚')
    expect(result.negative).toEqual(['破壊'])
  })

  it('should parse backtick-quoted negative', () => {
    const result = parseNegativePatterns('効果 -`対象`')
    expect(result.positive).toBe('効果')
    expect(result.negative).toEqual(['対象'])
  })

  it('should parse multiple negatives', () => {
    const result = parseNegativePatterns('カード -"破壊" -"除外"')
    expect(result.positive).toBe('カード')
    expect(result.negative).toEqual(['破壊', '除外'])
  })

  it('should handle negative at start', () => {
    const result = parseNegativePatterns('-"無効" 効果')
    expect(result.positive).toBe('効果')
    expect(result.negative).toEqual(['無効'])
  })

  it('should handle only negative', () => {
    const result = parseNegativePatterns('-"破壊"')
    expect(result.positive).toBe('')
    expect(result.negative).toEqual(['破壊'])
  })
})
