// Probe: Gemma 4 (via Ollama) 의 thinking 동작을 raw 로 확인.
// 3 가지 조건으로 동일 프롬프트를 쏘고 응답 chunk 구조를 관찰한다.
import { Ollama } from '../node_modules/ollama/dist/index.mjs'

const ollama = new Ollama({ host: 'http://localhost:11434' })

const MODEL = 'gemma4:e4b'
const TEXT = '荷物をまとめてクレイトン家に向かうなり家を出て行くなり好きにするがいい'
const PROMPT = `You are a professional translator. Translate the following text to 한국어. Output ONLY the translation, no explanations or notes.\n\n${TEXT}`

async function run(label, options) {
  console.log(`\n========== ${label} ==========`)
  console.log('request options:', JSON.stringify(options))
  let respBuf = ''
  let thinkBuf = ''
  let chunkCount = 0
  let firstKeys = null

  const response = await ollama.generate({
    model: MODEL,
    prompt: PROMPT,
    stream: true,
    keep_alive: '2m',
    ...options
  })

  for await (const part of response) {
    chunkCount++
    if (!firstKeys) firstKeys = Object.keys(part)
    if (part.response) respBuf += part.response
    if (part.thinking) thinkBuf += part.thinking
    if (chunkCount <= 3) {
      console.log(`  chunk #${chunkCount}:`, JSON.stringify(part).slice(0, 200))
    }
  }

  console.log('first chunk keys:', firstKeys)
  console.log('total chunks:', chunkCount)
  console.log(`response length: ${respBuf.length}, thinking length: ${thinkBuf.length}`)
  console.log('--- response preview (first 400 chars) ---')
  console.log(respBuf.slice(0, 400))
  if (thinkBuf) {
    console.log('--- thinking preview (first 400 chars) ---')
    console.log(thinkBuf.slice(0, 400))
  }
  console.log('--- response LAST 200 chars ---')
  console.log(respBuf.slice(-200))
}

try {
  await run('A. think: false', { think: false })
  await run('B. think: true', { think: true })
  await run('C. no think param', {})
} catch (err) {
  console.error('ERROR:', err)
  process.exit(1)
}
