// 최종 translateText 경로를 재현: <|think|> 리터럴 기반 on/off 검증.
import { Ollama } from '../node_modules/ollama/dist/index.mjs'

const ollama = new Ollama({ host: 'http://localhost:11434' })
const MODEL = 'gemma4:e4b'
const TEXT = '荷物をまとめてクレイトン家に向かうなり家を出て行くなり好きにするがいい'
const TARGET = '한국어'

const THINK_TOKEN = '<|think|>'
const SYSTEM = 'You are a professional translator. Output ONLY the translation, no explanations or notes.'

async function runTranslate(label, thinking) {
  console.log(`\n========== ${label} (thinking: ${thinking}) ==========`)
  const started = Date.now()
  let content = ''
  let reasoning = ''
  let chunks = 0

  const resp = await ollama.chat({
    model: MODEL,
    messages: [
      { role: 'system', content: (thinking ? THINK_TOKEN : '') + SYSTEM },
      { role: 'user', content: `Translate the following text to ${TARGET}.\n\n${TEXT}` }
    ],
    stream: true,
    keep_alive: '2m'
  })

  for await (const part of resp) {
    chunks++
    content += part.message?.content ?? ''
    reasoning += part.message?.thinking ?? ''
  }

  const ms = Date.now() - started
  console.log(`chunks: ${chunks}, ${ms}ms`)
  console.log(`content (${content.length}ch): ${content}`)
  console.log(`thinking (${reasoning.length}ch): ${reasoning.slice(0, 200)}${reasoning.length > 200 ? '...' : ''}`)
}

// 교차 실행으로 Ollama 내부 상태 의존성도 확인
await runTranslate('OFF-1', false)
await runTranslate('ON-1', true)
await runTranslate('OFF-2', false)
await runTranslate('ON-2', true)
