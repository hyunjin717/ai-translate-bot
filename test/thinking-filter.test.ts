import { describe, it, expect } from 'vitest'
import { ThinkingFilterStream } from '../electron/ollama-client'

function run(chunks: string[]): { output: string; resets: number } {
  let buf = ''
  let resets = 0
  const filter = new ThinkingFilterStream(
    (chunk) => {
      buf += chunk
    },
    () => {
      resets++
      buf = ''
    }
  )
  for (const c of chunks) filter.feed(c)
  filter.flush()
  return { output: buf, resets }
}

describe('ThinkingFilterStream', () => {
  it('passes through text with no thinking tags', () => {
    const r = run(['안녕하세요'])
    expect(r.output).toBe('안녕하세요')
    expect(r.resets).toBe(0)
  })

  it('strips Gemma 4 channel thought block with open tag', () => {
    const input = '<|channel>thought\nanalysis here\n<channel|>안녕하세요'
    const r = run([input])
    expect(r.output).toBe('안녕하세요')
    expect(r.resets).toBe(0)
  })

  it('strips <think> block', () => {
    const input = '<think>reasoning</think>translated'
    const r = run([input])
    expect(r.output).toBe('translated')
  })

  it('handles open tag split across chunks', () => {
    const r = run(['prefix<|chan', 'nel>thought\nreasoning<channel|>result'])
    expect(r.output).toBe('prefixresult')
  })

  it('handles close tag split across chunks', () => {
    const r = run(['<|channel>thought\nreasoning<chann', 'el|>result'])
    expect(r.output).toBe('result')
  })

  it('handles many small chunks', () => {
    const r = run(['<think>', 'a', 'b', 'c', '</thi', 'nk>', '번역'])
    expect(r.output).toBe('번역')
  })

  it('preserves text before thinking block', () => {
    const r = run(['before<think>mid</think>after'])
    expect(r.output).toBe('beforeafter')
  })

  it('handles multiple thinking blocks', () => {
    const r = run(['<think>a</think>first<think>b</think>second'])
    expect(r.output).toBe('firstsecond')
  })

  it('discards unterminated thinking block at end of stream', () => {
    const r = run(['visible<think>never closed'])
    expect(r.output).toBe('visible')
  })

  it('does not match unrelated angle-bracket text', () => {
    const r = run(['수학 <equation> 이런 괄호'])
    expect(r.output).toBe('수학 <equation> 이런 괄호')
  })

  it('handles single char chunks across tag boundary', () => {
    const text = '<think>x</think>ok'
    const r = run(text.split(''))
    expect(r.output).toBe('ok')
  })

  // 핵심: Ollama가 열림 토큰을 삼키고 닫힘 토큰만 흘리는 케이스
  it('resets when lone <channel|> appears without open tag', () => {
    const input = 'The user wants me to translate...\nAnalysis...\n<channel|>진짜 번역'
    const r = run([input])
    expect(r.output).toBe('진짜 번역')
    expect(r.resets).toBe(1)
  })

  it('resets after streaming reasoning across many chunks, close only', () => {
    const chunks = [
      'The user wants me to translate ',
      'Japanese to Korean.\n',
      'Plan: translate segment by segment.\n',
      '(Reviewing)',
      '<channel|>',
      '짐을 챙겨'
    ]
    const r = run(chunks)
    expect(r.output).toBe('짐을 챙겨')
    expect(r.resets).toBe(1)
  })

  it('resets when lone </think> appears without open tag', () => {
    const r = run(['reasoning text</think>clean answer'])
    expect(r.output).toBe('clean answer')
    expect(r.resets).toBe(1)
  })

  it('close-only reset handles split close tag', () => {
    const r = run(['reasoning<chann', 'el|>clean'])
    expect(r.output).toBe('clean')
    expect(r.resets).toBe(1)
  })
})
