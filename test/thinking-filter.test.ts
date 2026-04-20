import { describe, it, expect } from 'vitest'
import { ThinkingFilterStream } from '../electron/ollama-client'

function run(chunks: string[]): string {
  let out = ''
  const filter = new ThinkingFilterStream((chunk) => {
    out += chunk
  })
  for (const c of chunks) filter.feed(c)
  filter.flush()
  return out
}

describe('ThinkingFilterStream', () => {
  it('passes through text with no thinking tags', () => {
    expect(run(['안녕하세요'])).toBe('안녕하세요')
  })

  it('strips Gemma 4 channel thought block', () => {
    const input = '<|channel>thought\nanalysis here\n<channel|>안녕하세요'
    expect(run([input])).toBe('안녕하세요')
  })

  it('strips <think> block', () => {
    const input = '<think>reasoning</think>translated'
    expect(run([input])).toBe('translated')
  })

  it('handles tag split across chunks (open)', () => {
    const chunks = ['prefix<|chan', 'nel>thought\nreasoning<channel|>result']
    expect(run(chunks)).toBe('prefixresult')
  })

  it('handles tag split across chunks (close)', () => {
    const chunks = ['<|channel>thought\nreasoning<chann', 'el|>result']
    expect(run(chunks)).toBe('result')
  })

  it('handles thinking content split across many small chunks', () => {
    const chunks = ['<think>', 'a', 'b', 'c', '</thi', 'nk>', '번역']
    expect(run(chunks)).toBe('번역')
  })

  it('preserves text before first thinking block', () => {
    const input = 'before<think>mid</think>after'
    expect(run([input])).toBe('beforeafter')
  })

  it('handles multiple thinking blocks', () => {
    const input = '<think>a</think>first<think>b</think>second'
    expect(run([input])).toBe('firstsecond')
  })

  it('discards unterminated thinking block at end of stream', () => {
    const input = 'visible<think>never closed'
    expect(run([input])).toBe('visible')
  })

  it('does not falsely match partial tag-like text', () => {
    const input = '수학 <equation> 이런 괄호'
    expect(run([input])).toBe('수학 <equation> 이런 괄호')
  })

  it('handles single char chunks across boundary', () => {
    const text = '<think>x</think>ok'
    const chunks = text.split('')
    expect(run(chunks)).toBe('ok')
  })
})
