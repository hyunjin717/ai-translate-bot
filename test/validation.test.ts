import { describe, it, expect } from 'vitest'

const MAX_INPUT_LENGTH = 16000

function validateInput(text: string): { valid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: '번역할 텍스트가 없습니다.' }
  }
  if (text.length > MAX_INPUT_LENGTH) {
    return { valid: false, error: `텍스트가 너무 깁니다. (최대 ${MAX_INPUT_LENGTH.toLocaleString()}자)` }
  }
  return { valid: true }
}

describe('Input validation', () => {
  it('rejects empty string', () => {
    const result = validateInput('')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('번역할 텍스트가 없습니다')
  })

  it('rejects whitespace-only string', () => {
    const result = validateInput('   \n\t  ')
    expect(result.valid).toBe(false)
  })

  it('accepts normal text', () => {
    const result = validateInput('Hello, world!')
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('accepts text at exactly the limit', () => {
    const text = 'a'.repeat(MAX_INPUT_LENGTH)
    expect(validateInput(text).valid).toBe(true)
  })

  it('rejects text exceeding the limit', () => {
    const text = 'a'.repeat(MAX_INPUT_LENGTH + 1)
    const result = validateInput(text)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('16,000')
  })

  it('accepts Korean text', () => {
    expect(validateInput('안녕하세요 세계').valid).toBe(true)
  })

  it('accepts Japanese text', () => {
    expect(validateInput('こんにちは世界').valid).toBe(true)
  })

  it('accepts mixed language text', () => {
    expect(validateInput('Hello 안녕 こんにちは').valid).toBe(true)
  })
})
